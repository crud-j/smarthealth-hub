"""
Reminder scheduler — Celery Beat periodic tasks that scan upcoming appointments
and immunizations and enqueue SMS reminder tasks for those falling within the
configured lead-time window.

Tasks:
  dispatch_appointment_reminders  — runs hourly at :00
    Finds appointments with scheduled_at between now+lead-30min and now+lead+30min,
    status in ('pending', 'confirmed'), and no existing sms_log for this appointment.
    Creates sms_logs row (status='queued'), enqueues send_reminder_task.

  dispatch_immunization_reminders — runs daily at 08:00 Asia/Manila
    Finds immunizations with next_due_date == today + lead_days,
    status != 'completed', patient has mobile_number, no sms_log already
    created today for that patient with an immunization message.
    Creates sms_logs row (status='queued'), enqueues send_reminder_task.

Both tasks are idempotent: the NOT EXISTS guard prevents double-queuing if
Beat fires more than once in the same window (e.g. clock skew, restart).

Template registry (extend here for Filipino / other language variants):
  SMS_TEMPLATES["appointment_reminder"]["en"]
  SMS_TEMPLATES["immunization_reminder"]["en"]
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime, timedelta, UTC

from app.workers.celery_app import celery_app
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# SMS template registry
# ---------------------------------------------------------------------------
# Add Filipino ("fil") variants by adding another key under each template.
# The scheduler reads the "en" key by default; make the key selection
# configurable (e.g. from a barangay settings row) in a future iteration.

SMS_TEMPLATES: dict[str, dict[str, str]] = {
    "appointment_reminder": {
        "en": (
            "Hi {patient_name}, this is a reminder for your {appointment_type} "
            "appointment at the Barangay Health Center on {scheduled_date} at "
            "{scheduled_time}. Please arrive 15 minutes early. "
            "Reply STOP to unsubscribe."
        ),
    },
    "immunization_reminder": {
        "en": (
            "Hi {patient_name}, your {vaccine_name} immunization is due on "
            "{due_date} at the Barangay Health Center. Please bring your health "
            "card. Reply STOP to unsubscribe."
        ),
    },
}


def _build_full_name(first: str, middle: str | None, last: str) -> str:
    parts = [first]
    if middle:
        parts.append(middle)
    parts.append(last)
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Async scheduler logic (called via asyncio.run inside Celery tasks)
# ---------------------------------------------------------------------------


async def _dispatch_appointment_reminders_async() -> int:
    """
    Core async logic for appointment reminder dispatch.

    Returns the number of sms_log rows newly created (for logging).
    """
    from sqlalchemy import select, not_, exists, text
    from app.db.session import AsyncSessionLocal
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.models.sms_log import SmsLog

    lead_hours = settings.SMS_REMINDER_LEAD_HOURS
    now = datetime.now(tz=UTC)
    window_start = now + timedelta(hours=lead_hours) - timedelta(minutes=30)
    window_end = now + timedelta(hours=lead_hours) + timedelta(minutes=30)

    queued_count = 0

    async with AsyncSessionLocal() as db:
        # Find appointments in the reminder window that have not yet had
        # an sms_log created for them (status queued / sent / delivered).
        existing_sms_subq = (
            select(SmsLog.id)
            .where(
                SmsLog.appointment_id == Appointment.id,
                SmsLog.status.in_(["queued", "sent", "delivered"]),
            )
            .correlate(Appointment)
        )

        stmt = (
            select(Appointment, Patient)
            .join(Patient, Patient.id == Appointment.patient_id)
            .where(
                Appointment.scheduled_at >= window_start,
                Appointment.scheduled_at <= window_end,
                Appointment.status.in_(["pending", "confirmed"]),
                Patient.mobile_number.isnot(None),
                not_(exists(existing_sms_subq)),
            )
        )

        result = await db.execute(stmt)
        rows = result.all()

        for appt, patient in rows:
            full_name = _build_full_name(
                patient.first_name, patient.middle_name, patient.last_name
            )
            scheduled_date = appt.scheduled_at.strftime("%m/%d/%Y")
            scheduled_time = appt.scheduled_at.strftime("%I:%M %p")

            message = SMS_TEMPLATES["appointment_reminder"]["en"].format(
                patient_name=full_name,
                appointment_type=appt.appointment_type,
                scheduled_date=scheduled_date,
                scheduled_time=scheduled_time,
            )

            sms_log = SmsLog(
                id=uuid.uuid4(),
                patient_id=patient.id,
                appointment_id=appt.id,
                mobile_number=patient.mobile_number,
                message=message,
                status="queued",
            )
            db.add(sms_log)
            await db.flush()  # get the UUID before commit

            await db.commit()

            # Enqueue send_reminder_task after commit so the row is visible.
            try:
                from app.workers.sms_tasks import send_reminder_task
                send_reminder_task.delay(str(sms_log.id))
                queued_count += 1
                logger.info(
                    "Appointment reminder queued",
                    extra={
                        "appointment_id": str(appt.id),
                        "sms_log_id": str(sms_log.id),
                        "patient_id": str(patient.id),
                    },
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Failed to enqueue appointment reminder — Celery may be down",
                    extra={"sms_log_id": str(sms_log.id), "error": str(exc)},
                )

    return queued_count


async def _dispatch_immunization_reminders_async() -> int:
    """
    Core async logic for immunization reminder dispatch.

    Returns the number of sms_log rows newly created.
    """
    from sqlalchemy import and_, func, not_, exists, select
    from app.db.session import AsyncSessionLocal
    from app.models.immunization import Immunization
    from app.models.patient import Patient
    from app.models.sms_log import SmsLog

    lead_days = settings.SMS_IMMUNIZATION_LEAD_DAYS
    target_date: date = (datetime.now(tz=UTC) + timedelta(days=lead_days)).date()
    today: date = datetime.now(tz=UTC).date()

    queued_count = 0

    async with AsyncSessionLocal() as db:
        # Idempotency: skip if there's already an sms_log for this patient
        # today whose message contains the word "immunization".
        existing_today_subq = (
            select(SmsLog.id)
            .where(
                SmsLog.patient_id == Immunization.patient_id,
                SmsLog.immunization_id == Immunization.id,
                SmsLog.status.in_(["queued", "sent", "delivered"]),
                func.date(SmsLog.created_at) == today,
            )
            .correlate(Immunization)
        )

        stmt = (
            select(Immunization, Patient)
            .join(Patient, Patient.id == Immunization.patient_id)
            .where(
                Immunization.next_due_date == target_date,
                Immunization.status != "completed",
                Patient.mobile_number.isnot(None),
                not_(exists(existing_today_subq)),
            )
        )

        result = await db.execute(stmt)
        rows = result.all()

        for immunization, patient in rows:
            full_name = _build_full_name(
                patient.first_name, patient.middle_name, patient.last_name
            )
            due_date_str = immunization.next_due_date.strftime("%m/%d/%Y")

            message = SMS_TEMPLATES["immunization_reminder"]["en"].format(
                patient_name=full_name,
                vaccine_name=immunization.vaccine_name,
                due_date=due_date_str,
            )

            sms_log = SmsLog(
                id=uuid.uuid4(),
                patient_id=patient.id,
                immunization_id=immunization.id,
                mobile_number=patient.mobile_number,
                message=message,
                status="queued",
            )
            db.add(sms_log)
            await db.flush()
            await db.commit()

            try:
                from app.workers.sms_tasks import send_reminder_task
                send_reminder_task.delay(str(sms_log.id))
                queued_count += 1
                logger.info(
                    "Immunization reminder queued",
                    extra={
                        "immunization_id": str(immunization.id),
                        "sms_log_id": str(sms_log.id),
                        "patient_id": str(patient.id),
                        "target_date": str(target_date),
                    },
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Failed to enqueue immunization reminder — Celery may be down",
                    extra={"sms_log_id": str(sms_log.id), "error": str(exc)},
                )

    return queued_count


# ---------------------------------------------------------------------------
# Celery tasks (synchronous wrappers over async logic)
# ---------------------------------------------------------------------------


@celery_app.task(name="reminders.dispatch_appointment_reminders")
def dispatch_appointment_reminders() -> dict:  # type: ignore[type-arg]
    """
    Hourly periodic task (Celery Beat, runs at :00 every hour).

    Finds appointments within the SMS_REMINDER_LEAD_HOURS ± 30 min window,
    creates sms_logs rows (status='queued'), and enqueues send_reminder_task
    for each.  The NOT EXISTS guard makes this idempotent — duplicate runs
    (e.g. due to Beat restart) will not double-queue reminders.
    """
    logger.info("dispatch_appointment_reminders: starting")
    queued = asyncio.run(_dispatch_appointment_reminders_async())
    logger.info(
        "dispatch_appointment_reminders: completed",
        extra={"queued_count": queued},
    )
    return {"queued_count": queued}


@celery_app.task(name="reminders.dispatch_immunization_reminders")
def dispatch_immunization_reminders() -> dict:  # type: ignore[type-arg]
    """
    Daily periodic task (Celery Beat, runs at 08:00 Asia/Manila).

    Finds immunizations with next_due_date == today + SMS_IMMUNIZATION_LEAD_DAYS,
    creates sms_logs rows, and enqueues send_reminder_task for each.
    Idempotent: will not create a second log if one was already created today
    for the same immunization row.
    """
    logger.info("dispatch_immunization_reminders: starting")
    queued = asyncio.run(_dispatch_immunization_reminders_async())
    logger.info(
        "dispatch_immunization_reminders: completed",
        extra={"queued_count": queued},
    )
    return {"queued_count": queued}
