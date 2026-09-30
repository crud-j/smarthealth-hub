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

Template registry (extend here for additional language variants):
  SMS_TEMPLATES["appointment_reminder"]["en"]   — English
  SMS_TEMPLATES["appointment_reminder"]["fil"]  — Filipino
  SMS_TEMPLATES["immunization_reminder"]["en"]  — English
  SMS_TEMPLATES["immunization_reminder"]["fil"] — Filipino
  SMS_TEMPLATES["missed_appointment"]["en"]     — English
  SMS_TEMPLATES["missed_appointment"]["fil"]    — Filipino

Template selection uses patient.preferred_language; falls back to "en" when
the patient's preferred language is not present in the registry.
"""

from __future__ import annotations

import asyncio
import random
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any, cast

from sqlalchemy.engine import CursorResult

from app.core.config import settings
from app.core.logging import get_logger
from app.workers.celery_app import celery_app

logger = get_logger(__name__)

from app.workers.sms_tasks import send_reminder_task as _celery_send_reminder_task  # noqa: E402

send_reminder_task = _celery_send_reminder_task

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
        "fil": (
            "Kamusta {patient_name}, paalala: mayroon kang {appointment_type} "
            "na appointment sa {bhc_name} sa {scheduled_date} ng {scheduled_time}. "
            "Sagutin ng STOP para mag-opt out."
        ),
    },
    "immunization_reminder": {
        "en": (
            "Hi {patient_name}, your {vaccine_name} immunization is due on "
            "{due_date} at the Barangay Health Center. Please bring your health "
            "card. Reply STOP to unsubscribe."
        ),
        "fil": (
            "Kamusta {patient_name}, ang {vaccine_name} (dose {dose_number}) "
            "para kay {patient_name} ay dapat ibigay sa {due_date}. "
            "Pakidalaw ang {bhc_name}."
        ),
    },
    "missed_appointment": {
        "en": (
            "Hi {first_name}, we noticed you missed your appointment today. "
            "Please contact {bhc_name} to reschedule."
        ),
        "fil": (
            "Kamusta {first_name}, napansin namin na hindi ka dumating sa "
            "iyong appointment ngayon. Makipag-ugnayan sa {bhc_name} para mag-reschedule."
        ),
    },
}


def _resolve_lang(preferred_language: str | None, template_key: str) -> str:
    """
    Return the language key to use for a given template.

    Falls back to "en" when ``preferred_language`` is None, empty, or not
    present as a key in ``SMS_TEMPLATES[template_key]``.
    """
    lang = preferred_language or "en"
    if lang not in SMS_TEMPLATES.get(template_key, {}):
        lang = "en"
    return lang


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
    from sqlalchemy import exists, not_, select

    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.models.sms_log import SmsLog
    from app.workers.db import CelerySessionLocal

    lead_hours = settings.SMS_REMINDER_LEAD_HOURS
    now = datetime.now(tz=UTC)
    window_start = now + timedelta(hours=lead_hours) - timedelta(minutes=30)
    window_end = now + timedelta(hours=lead_hours) + timedelta(minutes=30)

    queued_count = 0

    async with CelerySessionLocal() as db:
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
                Patient.sms_opt_out.is_(False),
                not_(exists(existing_sms_subq)),
            )
        )

        result = await db.execute(stmt)
        rows = result.all()

        for appt, patient in rows:
            full_name = _build_full_name(patient.first_name, patient.middle_name, patient.last_name)
            scheduled_date = appt.scheduled_at.strftime("%m/%d/%Y")
            scheduled_time = appt.scheduled_at.strftime("%I:%M %p")

            lang = _resolve_lang(patient.preferred_language, "appointment_reminder")
            base_message = SMS_TEMPLATES["appointment_reminder"][lang].format(
                patient_name=full_name,
                appointment_type=appt.appointment_type,
                scheduled_date=scheduled_date,
                scheduled_time=scheduled_time,
                bhc_name=settings.BHC_NAME,
            )

            # Generate a 4-digit confirmation token for SMS reply-confirm flow.
            token = str(random.randint(1000, 9999))
            confirm_suffix = f" CONFIRM {token} to confirm."  # 25 chars

            # Ensure the final SMS body stays within 160 characters.
            # If the base message is too long, truncate it and add an ellipsis
            # before appending the suffix.
            max_base_len = 160 - len(confirm_suffix)
            if len(base_message) > max_base_len:
                base_message = base_message[: max_base_len - 3].rstrip() + "..."

            message = base_message + confirm_suffix

            sms_log = SmsLog(
                id=uuid.uuid4(),
                patient_id=patient.id,
                appointment_id=appt.id,
                mobile_number=patient.mobile_number,
                message=message,
                status="queued",
                sms_metadata={
                    "confirmation_token": token,
                    "appointment_id": str(appt.id),
                },
            )
            db.add(sms_log)
            await db.flush()  # get the UUID before commit

            await db.commit()

            # Enqueue send_reminder_task after commit so the row is visible.
            try:
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
    from sqlalchemy import exists, func, not_, select

    from app.models.immunization import Immunization
    from app.models.patient import Patient
    from app.models.sms_log import SmsLog
    from app.workers.db import CelerySessionLocal

    lead_days = settings.SMS_IMMUNIZATION_LEAD_DAYS
    target_date: date = (datetime.now(tz=UTC) + timedelta(days=lead_days)).date()
    today: date = datetime.now(tz=UTC).date()

    queued_count = 0

    async with CelerySessionLocal() as db:
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
                Patient.sms_opt_out.is_(False),
                not_(exists(existing_today_subq)),
            )
        )

        result = await db.execute(stmt)
        rows = result.all()

        for immunization, patient in rows:
            full_name = _build_full_name(patient.first_name, patient.middle_name, patient.last_name)
            due_date_str = immunization.next_due_date.strftime("%m/%d/%Y") if immunization.next_due_date is not None else ""  # type: ignore[union-attr]

            lang = _resolve_lang(patient.preferred_language, "immunization_reminder")
            message = SMS_TEMPLATES["immunization_reminder"][lang].format(
                patient_name=full_name,
                vaccine_name=immunization.vaccine_name,
                due_date=due_date_str,
                dose_number=immunization.dose_number,
                bhc_name=settings.BHC_NAME,
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


# ---------------------------------------------------------------------------
# Missed-appointment marking
# ---------------------------------------------------------------------------


async def _mark_missed_appointments_async() -> int:
    """
    Core async logic for marking past-due appointments as 'missed'.

    Updates all appointments whose status is 'pending' or 'confirmed' and
    whose scheduled_at is strictly before now() to status='missed'.

    After committing the status updates, enqueues a follow-up SMS for each
    appointment that was marked missed today and whose patient has a mobile
    number on file.  SMS enqueueing failures are logged as warnings and do
    NOT prevent the status update from being persisted.

    Returns the number of rows updated.
    """
    from sqlalchemy import func, select, update

    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.models.sms_log import SmsLog
    from app.workers.db import CelerySessionLocal

    # ── Step 1: bulk-update missed appointments ───────────────────────────────
    async with CelerySessionLocal() as db:
        result = await db.execute(
            update(Appointment)
            .where(
                Appointment.status.in_(["pending", "confirmed"]),
                Appointment.scheduled_at < datetime.now(tz=UTC),
            )
            .values(status="missed")
            .execution_options(synchronize_session=False)
        )
        await db.commit()
        updated_count: int = cast(CursorResult[tuple[()]], result).rowcount

    # ── Step 2: enqueue post-miss follow-up SMS for affected patients ─────────
    # Runs in a separate session so a failure here cannot roll back the status
    # update committed above.  Patients with sms_opt_out=True are skipped.
    try:
        async with CelerySessionLocal() as db:
            today = datetime.now(tz=UTC).date()

            missed_stmt = (
                select(
                    Appointment.id,
                    Appointment.patient_id,
                    Patient.mobile_number,
                    Patient.first_name,
                    Patient.preferred_language,
                )
                .join(Patient, Patient.id == Appointment.patient_id)
                .where(
                    Appointment.status == "missed",
                    func.date(Appointment.scheduled_at) == today,
                    Patient.mobile_number.isnot(None),
                    Patient.sms_opt_out.is_(False),
                )
            )

            missed_result = await db.execute(missed_stmt)
            missed_rows = missed_result.all()

            bhc_name: str = settings.BHC_NAME
            enqueued_count = 0

            for (
                appointment_id,
                patient_id,
                mobile_number,
                first_name,
                preferred_language,
            ) in missed_rows:
                lang = _resolve_lang(preferred_language, "missed_appointment")
                message = SMS_TEMPLATES["missed_appointment"][lang].format(
                    first_name=first_name,
                    bhc_name=bhc_name,
                )

                sms_log = SmsLog(
                    id=uuid.uuid4(),
                    patient_id=patient_id,
                    appointment_id=appointment_id,
                    mobile_number=mobile_number,
                    message=message,
                    status="queued",
                    sms_metadata={"trigger": "post_miss_followup"},
                )
                db.add(sms_log)
                await db.flush()  # populate sms_log.id before commit
                await db.commit()

                try:
                    send_reminder_task.apply_async(
                        args=[str(sms_log.id)],
                        queue="sms",
                        countdown=0,
                    )
                    enqueued_count += 1
                    logger.info(
                        "Post-miss follow-up SMS queued",
                        extra={
                            "appointment_id": str(appointment_id),
                            "patient_id": str(patient_id),
                            "sms_log_id": str(sms_log.id),
                        },
                    )
                except Exception as enqueue_exc:  # noqa: BLE001
                    logger.warning(
                        "Failed to enqueue post-miss SMS — Celery may be down",
                        extra={
                            "sms_log_id": str(sms_log.id),
                            "appointment_id": str(appointment_id),
                            "error": str(enqueue_exc),
                        },
                    )

        logger.info(
            "Post-miss follow-up: enqueued SMS for missed appointments",
            extra={"enqueued_count": enqueued_count, "date": str(today)},
        )

    except Exception as followup_exc:  # noqa: BLE001
        logger.warning(
            "Post-miss follow-up SMS block failed — missed-appointment status "
            "update was already committed and is not affected",
            extra={"error": str(followup_exc)},
        )

    return updated_count


@celery_app.task(name="workers.mark_missed_appointments", bind=True, max_retries=3)
def mark_missed_appointments(self: Any) -> dict:  # type: ignore[misc]
    """
    Nightly periodic task (Celery Beat, runs at 23:00 Asia/Manila).

    Sets status='missed' on all appointments that are still 'pending' or
    'confirmed' but whose scheduled_at has already passed.  This keeps the
    appointment list accurate without requiring staff to manually close
    no-shows.

    Retries up to 3 times with a 5-minute countdown on any exception.
    """
    logger.info("mark_missed_appointments: starting")
    try:
        updated = asyncio.run(_mark_missed_appointments_async())
        logger.info("Marked %d appointments as missed", updated)
        return {"updated_count": updated}
    except Exception as exc:
        logger.exception(
            "mark_missed_appointments: error — will retry",
            extra={"exc": str(exc)},
        )
        raise self.retry(exc=exc, countdown=300)
