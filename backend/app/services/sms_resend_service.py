"""
Resend a failed SMS.

A resend never edits the failed row (it is the record of what happened):
it creates a NEW sms_logs row with metadata ``resend_of = <failed id>``,
addressed to the patient's CURRENT mobile number, so a BHW can fix the
number on the patient record and then resend.  The caller queues it with
``send_reminder_task`` like any other reminder.

Rules (``resend_problem``) — a resend is refused when:
  - the row is not 'failed', or was already resent;
  - the patient is missing / archived, has no mobile number, or opted out;
  - it is about an appointment that is cancelled, completed or already
    started (except the after-miss follow-up, which is about a past
    appointment by design);
  - it is about a dose that is no longer 'scheduled'.

Appointment reminders carry a 4-digit CONFIRM code that the inbound-reply
handler looks up by value; the resend gets a fresh code (in the text and the
metadata) so a reply matches exactly one row.
"""

from __future__ import annotations

import re
import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.appointment import Appointment
from app.models.immunization import Immunization
from app.models.patient import Patient
from app.models.sms_log import SmsLog
from app.services.audit_service import write_audit_log

_CONFIRM_CODE = re.compile(r"CONFIRM \d{4}")
_POST_MISS_TRIGGER = "post_miss_followup"


def sms_kind(log: SmsLog) -> str:
    if log.appointment_id is not None:
        return "appointment"
    if log.immunization_id is not None:
        return "immunization"
    return "other"


async def resent_ids(db: AsyncSession, log_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """Which of ``log_ids`` already have a resend row."""
    if not log_ids:
        return set()
    resend_of = SmsLog.sms_metadata["resend_of"].astext
    rows = await db.execute(
        sa.select(resend_of).where(resend_of.in_([str(i) for i in log_ids])).distinct()
    )
    return {uuid.UUID(value) for (value,) in rows.all()}


async def resend_problem(
    db: AsyncSession, log: SmsLog, *, now: datetime | None = None, resent: bool | None = None
) -> str | None:
    """Why ``log`` cannot be resent, in words a BHW can act on; None when it can."""
    now = now or datetime.now(tz=UTC)
    if log.status != "failed":
        return "Only failed SMS can be resent."
    if resent is None:
        resent = log.id in await resent_ids(db, [log.id])
    if resent:
        return "This SMS was already resent."

    patient = await db.get(Patient, log.patient_id) if log.patient_id else None
    if patient is None:
        return "The patient record is missing."
    if not patient.is_active:
        return "The patient is inactive. Reactivate them on the Inactive Patients page first."
    if patient.archived_at is not None:
        return "The patient is archived. Restore them from the Patient Archive first."
    if not patient.mobile_number:
        return "The patient has no mobile number. Add one on the patient record first."
    if patient.sms_opt_out:
        return "The patient opted out of SMS."

    trigger = (log.sms_metadata or {}).get("trigger")
    if log.appointment_id is not None and trigger != _POST_MISS_TRIGGER:
        appt = await db.get(Appointment, log.appointment_id)
        if appt is None or appt.status in ("cancelled", "completed") or appt.scheduled_at <= now:
            return "The appointment has already passed, or it was cancelled or completed."
    if log.immunization_id is not None:
        dose = await db.get(Immunization, log.immunization_id)
        if dose is None or dose.status != "scheduled":
            return "The dose is no longer scheduled."
    return None


async def resend(
    db: AsyncSession,
    *,
    sms_log_id: uuid.UUID,
    user_id: uuid.UUID,
    ip_address: str | None = None,
) -> SmsLog:
    """
    Create and commit the resend row (status 'queued'); returns it.

    Raises NotFoundError for an unknown id and ConflictError with the reason
    when ``resend_problem`` refuses.  Writes a CREATE audit row on the new
    sms_log.  The caller enqueues ``send_reminder_task``.
    """
    log = await db.get(SmsLog, sms_log_id)
    if log is None:
        raise NotFoundError(f"SMS '{sms_log_id}' not found.")
    problem = await resend_problem(db, log)
    if problem is not None:
        raise ConflictError(problem)

    patient = await db.get(Patient, log.patient_id)
    assert patient is not None and patient.mobile_number  # checked by resend_problem

    metadata: dict[str, Any] = dict(log.sms_metadata or {})
    message = log.message
    if "confirmation_token" in metadata:
        token = f"{secrets.randbelow(9000) + 1000}"
        metadata["confirmation_token"] = token
        message = _CONFIRM_CODE.sub(f"CONFIRM {token}", message)
    metadata["resend_of"] = str(log.id)

    new = SmsLog(
        id=uuid.uuid4(),
        patient_id=log.patient_id,
        appointment_id=log.appointment_id,
        immunization_id=log.immunization_id,
        mobile_number=patient.mobile_number,
        message=message,
        status="queued",
        sms_metadata=metadata,
    )
    db.add(new)
    await db.flush()

    await write_audit_log(
        db=db,
        user_id=user_id,
        action="CREATE",
        entity_type="sms_log",
        entity_id=new.id,
        metadata={"resend_of": str(log.id), "kind": sms_kind(log)},
        ip_address=ip_address,
    )
    await db.commit()
    return new
