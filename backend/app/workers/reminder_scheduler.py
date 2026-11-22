"""
Reminder scheduler — Celery Beat periodic tasks that scan upcoming appointments
and immunizations and enqueue SMS reminder tasks for those falling within the
configured lead-time window.

Tasks:
  dispatch_appointment_reminders  — runs hourly at :00
    Finds appointments with scheduled_at between now+lead-30min and now+lead+30min,
    status in ('pending', 'confirmed'), and no existing sms_log for this appointment.
    Creates sms_logs row (status='queued'), enqueues send_reminder_task.

  dispatch_immunization_reminders — runs daily at 10:00 Asia/Manila
    Finds scheduled immunizations with next_due_date from today (Manila) up
    to today + lead_days, patient has mobile_number and has not opted out,
    and no reminder for that dose was ever queued / sent / delivered /
    replied. The window (not one exact date) catches up days the job did not
    run: Beat runs a missed job only once after start-up (not once per missed
    day), and not at all after a deploy recreated the beat container.
    Creates sms_logs row (status='queued'), enqueues send_reminder_task.

Both tasks are idempotent: the NOT EXISTS guard prevents double-queuing if
Beat fires more than once in the same window (e.g. clock skew, restart).

Lead times, the clinic name and the SMS templates come from
app.services.system_settings_service (admin-editable on the System
Configuration page; defaults: .env and app.services.sms_templates). They are
read at the start of every run, so a change applies on the next run.

Template selection uses patient.preferred_language; falls back to "en" when
there is no template for the patient's language.
"""

from __future__ import annotations

import asyncio
import random
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any, cast
from zoneinfo import ZoneInfo

from sqlalchemy.engine import CursorResult

from app.core.logging import get_logger
from app.services.sms_templates import confirmation_suffix
from app.services.system_settings_service import load_runtime_settings
from app.workers.celery_app import celery_app
from app.workers.monitoring_tasks import record_reminder_run

logger = get_logger(__name__)

from app.workers.sms_tasks import send_reminder_task as _celery_send_reminder_task  # noqa: E402

send_reminder_task = _celery_send_reminder_task

_MANILA_TZ = ZoneInfo("Asia/Manila")
# An immunization reminder in one of these states counts as done (a "failed"
# one is tried again at the next run).
_REMINDED_STATUSES = ("queued", "sent", "delivered", "replied")


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

    queued_count = 0

    async with CelerySessionLocal() as db:
        runtime = await load_runtime_settings(db)
        lead_hours = runtime.sms_reminder_lead_hours
        now = datetime.now(tz=UTC)
        window_start = now + timedelta(hours=lead_hours) - timedelta(minutes=30)
        window_end = now + timedelta(hours=lead_hours) + timedelta(minutes=30)

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

            base_message = runtime.render_sms(
                "appointment_reminder",
                patient.preferred_language,
                patient_name=full_name,
                appointment_type=appt.appointment_type.replace("_", " "),
                scheduled_date=scheduled_date,
                scheduled_time=scheduled_time,
            )

            # Generate a 4-digit confirmation token for SMS reply-confirm flow.
            token = str(random.randint(1000, 9999))
            confirm_suffix = confirmation_suffix(token, patient.preferred_language)

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


def manila_today(now: datetime | None = None) -> date:
    """Today's calendar date in Manila (``next_due_date`` is a local date)."""
    return (now or datetime.now(tz=UTC)).astimezone(_MANILA_TZ).date()


async def _dispatch_immunization_reminders_async(today: date | None = None) -> int:
    """
    Core async logic for immunization reminder dispatch.

    Picks every scheduled dose due from ``today`` up to ``today + lead days``
    that has never had a reminder queued / sent / delivered / replied. A day
    the job did not run (VM off all day, or a deploy after 10:00) is caught
    up at the next run, and a reminder the gateway reported as failed is
    tried again.

    ``today`` defaults to the Manila date; tests pass a fixed date.
    Returns the number of sms_log rows newly created.
    """
    from sqlalchemy import exists, not_, select

    from app.models.immunization import Immunization
    from app.models.patient import Patient
    from app.models.sms_log import SmsLog
    from app.workers.db import CelerySessionLocal

    queued_count = 0

    async with CelerySessionLocal() as db:
        runtime = await load_runtime_settings(db)
        lead_days = runtime.sms_immunization_lead_days
        if today is None:
            today = manila_today()
        last_due_date: date = today + timedelta(days=lead_days)

        # One reminder per dose: skip doses that already have one (any day).
        already_reminded_subq = (
            select(SmsLog.id)
            .where(
                SmsLog.immunization_id == Immunization.id,
                SmsLog.status.in_(_REMINDED_STATUSES),
            )
            .correlate(Immunization)
        )

        stmt = (
            select(Immunization, Patient)
            .join(Patient, Patient.id == Immunization.patient_id)
            .where(
                Immunization.next_due_date >= today,
                Immunization.next_due_date <= last_due_date,
                Immunization.status == "scheduled",
                Patient.mobile_number.isnot(None),
                Patient.sms_opt_out.is_(False),
                not_(exists(already_reminded_subq)),
            )
        )

        result = await db.execute(stmt)
        rows = result.all()

        for immunization, patient in rows:
            full_name = _build_full_name(patient.first_name, patient.middle_name, patient.last_name)
            due_date_str = (
                immunization.next_due_date.strftime("%m/%d/%Y")
                if immunization.next_due_date is not None
                else ""
            )  # type: ignore[union-attr]

            message = runtime.render_sms(
                "immunization_reminder",
                patient.preferred_language,
                patient_name=full_name,
                vaccine_name=immunization.vaccine_name,
                due_date=due_date_str,
                dose_number=immunization.dose_number,
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
                        "due_date": str(immunization.next_due_date),
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

    Finds appointments within the reminder lead time (admin setting) ± 30 min window,
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
    record_reminder_run("appointment", queued)  # shown on System Health
    return {"queued_count": queued}


@celery_app.task(name="reminders.dispatch_immunization_reminders")
def dispatch_immunization_reminders() -> dict:  # type: ignore[type-arg]
    """
    Daily periodic task (Celery Beat, runs at 10:00 Asia/Manila).

    Finds scheduled immunizations due from today up to today + immunization
    lead days (admin setting) that never had a reminder, creates sms_logs
    rows, and enqueues send_reminder_task for each. A skipped day is caught
    up at the next run; a dose is never reminded twice (unless the earlier
    reminder failed).
    """
    logger.info("dispatch_immunization_reminders: starting")
    queued = asyncio.run(_dispatch_immunization_reminders_async())
    logger.info(
        "dispatch_immunization_reminders: completed",
        extra={"queued_count": queued},
    )
    record_reminder_run("immunization", queued)  # shown on System Health
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

            runtime = await load_runtime_settings(db)
            enqueued_count = 0

            for (
                appointment_id,
                patient_id,
                mobile_number,
                first_name,
                preferred_language,
            ) in missed_rows:
                message = runtime.render_sms(
                    "missed_appointment",
                    preferred_language,
                    first_name=first_name,
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
    Daily periodic task (Celery Beat, runs at 18:00 Asia/Manila).

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
