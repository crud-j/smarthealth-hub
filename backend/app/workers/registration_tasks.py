"""
Post-registration Celery tasks — automatically enqueued after a patient is created.

Tasks:
  send_welcome_sms_task(patient_id: str)
    Loads the patient, creates an sms_logs row, and sends a welcome SMS via Semaphore.
    Skips if the patient has no mobile_number.
    Retries up to SMS_MAX_RETRIES times on SMSTransientError.
    Does not raise on SMSPermanentError — marks the log as 'failed' and returns.

  queue_health_card_generation_task(patient_id: str)
    Creates a HealthCard placeholder row with status='active' to indicate that a health
    card is expected for this patient.  Idempotent: checks for an existing row first and
    catches IntegrityError on concurrent inserts so retries do not create duplicates.

    Field notes (verified against health_card.py):
      - card_number  (String(30), NOT NULL, UNIQUE): placeholder generated as
        "PENDING-<patient_id_prefix>" so the uniqueness constraint is satisfied without
        a race condition.  Staff replaces this when they generate the real card.
      - qr_payload_hash (Text, NOT NULL): stored as "" until the real card is generated
        (the verify endpoint rejects cards whose qr_payload_hash is empty, which is the
        correct behaviour — no verification until the card is actually issued).
      - card_version (int, server_default=1): supplied explicitly as 1.
      - status (String(20), server_default='active'): supplied as 'active'.
      - nfc_uid, issued_by, expires_at: all nullable — omitted.

  send_photo_reminder_task(patient_id: str, staff_user_id: str)
    Scheduled with countdown=86400 (24 hours after registration).
    At execution time: checks if patient.photo_path IS NULL.
    If photo is missing, sends an email reminder to the staff user's email address.
    If photo is already uploaded, exits as a no-op.
    Logs a warning and exits if the staff user has no email address.

Security note:
  Task arguments contain ONLY UUIDs — no PHI is placed in Celery task arguments.
  The welcome SMS message body contains the patient's first name and patient_code only.

Email note:
  Uses email_service._send_email_sync (module-level sync function confirmed in
  email_service.py) via asyncio.to_thread so it does not block the Celery worker's
  asyncio.run() event loop.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

from celery import Task

from app.core.config import settings
from app.core.logging import get_logger
from app.services.sms_service import SMSPermanentError, SMSTransientError
from app.workers.celery_app import celery_app

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Welcome SMS message template
# Message body must contain NO PHI beyond first name and patient_code.
# ---------------------------------------------------------------------------

_WELCOME_MSG_TEMPLATE = (
    "Kumusta {first_name}! Nairehistro na kayo sa Sta. Rosa 1 BHS. "
    "Patient No.: {patient_code}. Para sa appointment, tumawag sa (044) 000-0000."
)


# ---------------------------------------------------------------------------
# Sync runner (same pattern as sms_tasks._run_async)
# ---------------------------------------------------------------------------


def _run_async(coro: Any) -> Any:  # type: ignore[misc]
    """Run a coroutine synchronously inside a Celery task."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Task 1: send_welcome_sms_task
# ---------------------------------------------------------------------------


async def _send_welcome_sms_async(patient_id: str) -> dict:  # type: ignore[type-arg]
    from sqlalchemy import select  # noqa: PLC0415

    from app.models.patient import Patient  # noqa: PLC0415
    from app.models.sms_log import SmsLog  # noqa: PLC0415
    from app.services.sms_service import SMSService  # noqa: PLC0415
    from app.workers.db import CelerySessionLocal  # noqa: PLC0415

    patient_uuid = uuid.UUID(patient_id)

    async with CelerySessionLocal() as db:
        result = await db.execute(select(Patient).where(Patient.id == patient_uuid))
        patient: Patient | None = result.scalar_one_or_none()

        if patient is None:
            logger.error(
                "send_welcome_sms_task: patient not found",
                extra={"patient_id": patient_id},
            )
            return {"patient_id": patient_id, "status": "error", "reason": "patient_not_found"}

        if not patient.mobile_number:
            logger.info(
                "send_welcome_sms_task: patient has no mobile number — skipping",
                extra={"patient_id": patient_id},
            )
            return {"patient_id": patient_id, "status": "skipped", "reason": "no_mobile_number"}

        message = _WELCOME_MSG_TEMPLATE.format(
            first_name=patient.first_name,
            patient_code=patient.patient_code,
        )

        sms_log = SmsLog(
            id=uuid.uuid4(),
            patient_id=patient_uuid,
            mobile_number=patient.mobile_number,
            message=message,
            status="queued",
            sms_metadata={"message_type": "welcome"},
        )
        db.add(sms_log)
        await db.flush()
        await db.commit()

        sms_svc = SMSService()
        try:
            api_result = await sms_svc.send_sms(
                mobile_number=patient.mobile_number,
                message=message,
            )
            sms_log.status = "sent"
            sms_log.provider_message_id = api_result.get("message_id", "")
            sms_log.sent_at = datetime.now(tz=UTC)
            await db.commit()
            logger.info(
                "send_welcome_sms_task: welcome SMS sent",
                extra={
                    "patient_id": patient_id,
                    "patient_code": patient.patient_code,
                    "sms_log_id": str(sms_log.id),
                },
            )
            return {
                "patient_id": patient_id,
                "status": "sent",
                "sms_log_id": str(sms_log.id),
            }

        except SMSPermanentError as exc:
            sms_log.status = "failed"
            sms_log.error_detail = f"{exc} (HTTP {exc.status_code}): {exc.body[:300]}"
            await db.commit()
            logger.error(
                "send_welcome_sms_task: permanent SMS failure",
                extra={
                    "patient_id": patient_id,
                    "status_code": exc.status_code,
                    "body": exc.body[:200],
                },
            )
            return {"patient_id": patient_id, "status": "failed", "reason": "permanent_error"}

        except SMSTransientError:
            sms_log.status = "failed"
            await db.commit()
            raise  # triggers autoretry


@celery_app.task(
    bind=True,
    autoretry_for=(SMSTransientError,),
    retry_backoff=True,
    retry_backoff_max=300,
    max_retries=settings.SMS_MAX_RETRIES,
    name="registration.send_welcome_sms",
    acks_late=True,
)
def send_welcome_sms_task(self: Task, patient_id: str) -> dict:  # type: ignore[type-arg]
    """Send a welcome SMS to the patient after successful registration."""
    logger.info(
        "send_welcome_sms_task started",
        extra={
            "patient_id": patient_id,
            "attempt": self.request.retries + 1,
            "max_retries": self.max_retries,
        },
    )
    return _run_async(_send_welcome_sms_async(patient_id))


# ---------------------------------------------------------------------------
# Task 2: queue_health_card_generation_task
# ---------------------------------------------------------------------------


async def _queue_health_card_async(patient_id: str) -> dict:  # type: ignore[type-arg]
    from sqlalchemy import select  # noqa: PLC0415
    from sqlalchemy.exc import IntegrityError  # noqa: PLC0415

    from app.models.health_card import HealthCard  # noqa: PLC0415
    from app.models.patient import Patient  # noqa: PLC0415
    from app.workers.db import CelerySessionLocal  # noqa: PLC0415

    patient_uuid = uuid.UUID(patient_id)
    # Placeholder card_number: "PENDING-" + first 20 chars of patient UUID (hex, no dashes).
    # Satisfies the NOT NULL + UNIQUE constraint on card_number.
    # Staff overwrites this with a real generated card number when the card is produced.
    placeholder_card_number = f"PENDING-{patient_uuid.hex[:20].upper()}"

    async with CelerySessionLocal() as db:
        existing = await db.execute(select(HealthCard).where(HealthCard.patient_id == patient_uuid))
        if existing.scalar_one_or_none() is not None:
            logger.info(
                "queue_health_card_generation_task: health card already exists — skipping",
                extra={"patient_id": patient_id},
            )
            return {"patient_id": patient_id, "status": "already_exists"}

        patient_result = await db.execute(select(Patient).where(Patient.id == patient_uuid))
        patient: Patient | None = patient_result.scalar_one_or_none()
        if patient is None:
            logger.error(
                "queue_health_card_generation_task: patient not found",
                extra={"patient_id": patient_id},
            )
            return {"patient_id": patient_id, "status": "error", "reason": "patient_not_found"}

        # HealthCard field notes (verified from health_card.py):
        #   - id:              UUID, required (server_default gen_random_uuid — we supply it)
        #   - patient_id:      UUID FK, NOT NULL
        #   - card_number:     String(30), NOT NULL, UNIQUE — placeholder until real card issued
        #   - qr_payload_hash: Text, NOT NULL — empty string until real card is generated
        #   - nfc_uid:         String(64), nullable — omitted
        #   - card_version:    Integer, NOT NULL (server_default=1) — supplied explicitly
        #   - status:          String(20), NOT NULL (server_default='active') — supplied explicitly
        #   - issued_at:       TIMESTAMP, NOT NULL (server_default=now()) — let DB fill
        #   - expires_at:      nullable — omitted
        #   - issued_by:       UUID FK, nullable — omitted
        health_card = HealthCard(
            id=uuid.uuid4(),
            patient_id=patient_uuid,
            card_number=placeholder_card_number,
            qr_payload_hash="",  # empty until staff generates the real card
            card_version=1,
            status="active",
        )
        db.add(health_card)
        try:
            await db.commit()
            logger.info(
                "queue_health_card_generation_task: health card placeholder created",
                extra={
                    "patient_id": patient_id,
                    "health_card_id": str(health_card.id),
                    "card_number": placeholder_card_number,
                },
            )
            return {
                "patient_id": patient_id,
                "status": "created",
                "health_card_id": str(health_card.id),
            }
        except IntegrityError:
            await db.rollback()
            logger.info(
                "queue_health_card_generation_task: concurrent insert detected — skipping",
                extra={"patient_id": patient_id},
            )
            return {"patient_id": patient_id, "status": "already_exists"}


@celery_app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    max_retries=3,
    name="registration.queue_health_card_generation",
    acks_late=True,
)
def queue_health_card_generation_task(self: Task, patient_id: str) -> dict:  # type: ignore[type-arg]
    """Create a placeholder HealthCard row for the patient (idempotent)."""
    logger.info(
        "queue_health_card_generation_task started",
        extra={"patient_id": patient_id, "attempt": self.request.retries + 1},
    )
    return _run_async(_queue_health_card_async(patient_id))


# ---------------------------------------------------------------------------
# Task 3: send_photo_reminder_task
# ---------------------------------------------------------------------------


async def _send_photo_reminder_async(patient_id: str, staff_user_id: str) -> dict:  # type: ignore[type-arg]
    from sqlalchemy import select  # noqa: PLC0415

    from app.models.patient import Patient  # noqa: PLC0415
    from app.models.user import User  # noqa: PLC0415
    from app.workers.db import CelerySessionLocal  # noqa: PLC0415

    patient_uuid = uuid.UUID(patient_id)
    staff_uuid = uuid.UUID(staff_user_id)

    async with CelerySessionLocal() as db:
        patient_result = await db.execute(select(Patient).where(Patient.id == patient_uuid))
        patient: Patient | None = patient_result.scalar_one_or_none()

        if patient is None:
            logger.warning(
                "send_photo_reminder_task: patient not found",
                extra={"patient_id": patient_id},
            )
            return {"patient_id": patient_id, "status": "error", "reason": "patient_not_found"}

        if patient.photo_path is not None:
            logger.info(
                "send_photo_reminder_task: patient already has a photo — no-op",
                extra={"patient_id": patient_id},
            )
            return {"patient_id": patient_id, "status": "noop", "reason": "photo_already_uploaded"}

        user_result = await db.execute(select(User).where(User.id == staff_uuid))
        staff_user: User | None = user_result.scalar_one_or_none()

        if staff_user is None:
            logger.warning(
                "send_photo_reminder_task: staff user not found",
                extra={"staff_user_id": staff_user_id},
            )
            return {"patient_id": patient_id, "status": "skipped", "reason": "staff_not_found"}

        if not staff_user.email:
            logger.warning(
                "send_photo_reminder_task: staff user has no email address — skipping",
                extra={"staff_user_id": staff_user_id},
            )
            return {"patient_id": patient_id, "status": "skipped", "reason": "no_email"}

    # Send reminder email outside the DB session (session auto-closed above).
    # _send_email_sync confirmed in email_service.py — module-level sync function
    # with signature (to_address: str, subject: str, html_body: str) -> None.
    patient_display = f"{patient.first_name} {patient.last_name} ({patient.patient_code})"
    subject = f"Photo reminder: {patient_display}"
    html_body = f"""
    <div style="font-family:system-ui,sans-serif;font-size:15px;color:#374151;padding:24px;">
      <h2 style="color:#1e293b;">Patient Photo Reminder</h2>
      <p>Hi {staff_user.full_name},</p>
      <p>
        The patient <strong>{patient_display}</strong> was registered 24 hours ago
        but does not yet have a profile photo on file.
      </p>
      <p>
        Please capture or upload a photo at your earliest convenience by opening
        the patient profile in SmartHealth Hub.
      </p>
      <p style="color:#6b7280;font-size:13px;">
        This is an automated reminder from SmartHealth Hub.<br>
        Please do not reply to this email.
      </p>
    </div>
    """

    try:
        from app.services.email_service import _send_email_sync  # noqa: PLC0415

        await asyncio.to_thread(
            _send_email_sync,
            staff_user.email,
            subject,
            html_body,
        )
        logger.info(
            "send_photo_reminder_task: reminder email sent",
            extra={
                "patient_id": patient_id,
                "staff_user_id": staff_user_id,
                "to_email": staff_user.email,
            },
        )
        return {"patient_id": patient_id, "status": "sent", "to_email": staff_user.email}

    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "send_photo_reminder_task: email send failed — not retrying",
            extra={
                "patient_id": patient_id,
                "staff_user_id": staff_user_id,
                "error": str(exc),
            },
        )
        return {"patient_id": patient_id, "status": "failed", "reason": str(exc)}


@celery_app.task(
    bind=True,
    name="registration.send_photo_reminder",
    acks_late=True,
    max_retries=0,
)
def send_photo_reminder_task(self: Task, patient_id: str, staff_user_id: str) -> dict:  # type: ignore[type-arg]
    """
    Send a photo-missing reminder email to the registering staff member.
    Scheduled with countdown=86400 (24 hours). No-op if photo was uploaded in the meantime.
    """
    logger.info(
        "send_photo_reminder_task started",
        extra={"patient_id": patient_id, "staff_user_id": staff_user_id},
    )
    return _run_async(_send_photo_reminder_async(patient_id, staff_user_id))
