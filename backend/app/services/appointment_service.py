"""
Appointment domain service — all business logic for appointment management.

Responsibilities
----------------
- create_appointment   Schedule a new appointment; enqueue SMS reminder
                       fire-and-forget; write CREATE audit log.
- get_appointment      Fetch single appointment with patient JOIN; raise
                       NotFoundError on miss.
- list_appointments    Paginated list with filters: patient_id, status,
                       from_date, to_date.
- update_appointment   Partial-update fields; write UPDATE audit log.
- cancel_appointment   Set status='cancelled'; write DELETE audit log.

SMS reminder contract (fire-and-forget):
  After a successful INSERT, the service tries to enqueue a Celery task.
  If Celery/Redis is unavailable the exception is caught and logged — it must
  never surface to the HTTP caller and must never roll back the appointment.

Audit log actions used:
  "CREATE" on entity_type "appointment"
  "UPDATE" on entity_type "appointment"
  "DELETE" on entity_type "appointment"  (cancel maps to DELETE for audit purposes)
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.schemas.appointment import AppointmentCreate, AppointmentResponse, AppointmentUpdate
from app.services.audit_service import write_audit_log

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_full_name(patient: Patient) -> str:
    """Assemble "First [Middle] Last" from Patient ORM columns."""
    parts = [patient.first_name]
    if patient.middle_name:
        parts.append(patient.middle_name)
    parts.append(patient.last_name)
    return " ".join(parts)


def _appointment_to_response(appt: Appointment, patient: Patient) -> AppointmentResponse:
    """
    Map an Appointment ORM instance + its Patient to an AppointmentResponse.

    ``updated_at`` falls back to ``created_at`` because the Appointment model
    does not currently have a separate updated_at column.
    """
    return AppointmentResponse(
        id=appt.id,
        patient_id=appt.patient_id,
        patient_code=patient.patient_code,
        full_name=_build_full_name(patient),
        appointment_type=appt.appointment_type,
        scheduled_at=appt.scheduled_at,
        status=appt.status,
        notes=appt.notes,
        created_at=appt.created_at,
        updated_at=appt.created_at,  # no updated_at column on Appointment yet
    )


async def _get_patient_or_404(db: AsyncSession, patient_id: uuid.UUID) -> Patient:
    """Load patient by PK; raise NotFoundError if missing or inactive."""
    result = await db.execute(
        select(Patient).where(Patient.id == patient_id, Patient.is_active.is_(True))
    )
    patient: Patient | None = result.scalar_one_or_none()
    if patient is None:
        raise NotFoundError(f"Patient '{patient_id}' not found or is inactive.")
    return patient


async def _get_appointment_with_patient(
    db: AsyncSession,
    appointment_id: uuid.UUID,
) -> tuple[Appointment, Patient]:
    """
    Load an Appointment + its Patient in a single query using a JOIN.
    Raises NotFoundError if the appointment does not exist.
    """
    result = await db.execute(
        select(Appointment, Patient)
        .join(Patient, Patient.id == Appointment.patient_id)
        .where(Appointment.id == appointment_id)
    )
    row = result.first()
    if row is None:
        raise NotFoundError(f"Appointment '{appointment_id}' not found.")
    return row[0], row[1]  # (Appointment, Patient)


def _enqueue_sms_reminder(sms_log_id: uuid.UUID) -> None:
    """
    Enqueue a Celery SMS reminder task.  Fire-and-forget: any exception
    (Redis down, Celery not started) is caught and logged so it never
    surfaces to the HTTP caller or rolls back the appointment transaction.

    The task receives only the sms_log_id (a UUID string) — no PHI is placed
    in Celery task arguments.
    """
    try:
        from app.workers.sms_tasks import send_reminder_task
        send_reminder_task.delay(str(sms_log_id))
        logger.info(
            "SMS reminder task enqueued",
            extra={"sms_log_id": str(sms_log_id)},
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Failed to enqueue SMS reminder task — Celery/Redis may be unavailable",
            extra={"sms_log_id": str(sms_log_id), "error": str(exc)},
        )


async def _create_sms_log_for_appointment(
    db: AsyncSession,
    appointment: Appointment,
    patient: Patient,
) -> uuid.UUID | None:
    """
    Create an sms_logs row (status='queued') for an appointment reminder.

    Returns the created sms_log.id so the caller can enqueue the Celery
    task with this ID.  Returns None if the patient has no mobile number.
    """
    if not patient.mobile_number:
        logger.info(
            "Patient has no mobile number — skipping SMS reminder",
            extra={"patient_id": str(patient.id), "appointment_id": str(appointment.id)},
        )
        return None

    from app.models.sms_log import SmsLog
    from app.services.sms_service import SMSService

    sms_svc = SMSService()
    message = sms_svc.build_appointment_reminder(
        patient_name=_build_full_name(patient),
        appointment_type=appointment.appointment_type,
        scheduled_at=appointment.scheduled_at,
    )

    sms_log = SmsLog(
        id=uuid.uuid4(),
        patient_id=patient.id,
        appointment_id=appointment.id,
        mobile_number=patient.mobile_number,
        message=message,
        status="queued",
    )
    db.add(sms_log)
    await db.flush()  # get the ID without committing the outer transaction
    return sms_log.id


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def create_appointment(
    db: AsyncSession,
    data: AppointmentCreate,
    created_by_user_id: uuid.UUID,
    ip_address: str | None = None,
) -> AppointmentResponse:
    """
    Schedule a new appointment.

    Steps:
      1. Validate patient exists and is active.
      2. Validate scheduled_at is in the future.
      3. INSERT appointment row.
      4. If patient has mobile_number, INSERT sms_logs row (status='queued').
      5. Commit.
      6. Fire-and-forget: enqueue send_reminder_task(sms_log_id).
      7. Write audit log.

    Args:
        db:                 Active async session.
        data:               Validated AppointmentCreate payload.
        created_by_user_id: UUID of the staff user creating the appointment.
        ip_address:         Client IP for audit log (optional).

    Returns:
        AppointmentResponse with denormalized patient fields.

    Raises:
        NotFoundError:    Patient does not exist or is inactive.
        ValidationError:  scheduled_at is in the past.
    """
    patient = await _get_patient_or_404(db, data.patient_id)

    # Business rule: appointment must be in the future.
    now = datetime.now(tz=data.scheduled_at.tzinfo)
    if data.scheduled_at <= now:
        raise ValidationError(
            "scheduled_at must be a future datetime.",
            detail={"scheduled_at": str(data.scheduled_at)},
        )

    appt = Appointment(
        id=uuid.uuid4(),
        patient_id=data.patient_id,
        appointment_type=data.appointment_type,
        scheduled_at=data.scheduled_at,
        status="pending",
        notes=data.notes,
        created_by=created_by_user_id,
    )
    db.add(appt)
    await db.flush()  # assign the ID before creating the sms_log FK reference

    sms_log_id = await _create_sms_log_for_appointment(db, appt, patient)
    await db.commit()
    await db.refresh(appt)

    # Audit log (fire-and-forget — never blocks on failure).
    await write_audit_log(
        db=db,
        action="CREATE",
        entity_type="appointment",
        user_id=created_by_user_id,
        entity_id=appt.id,
        metadata={
            "patient_id": str(data.patient_id),
            "appointment_type": data.appointment_type,
            "scheduled_at": data.scheduled_at.isoformat(),
        },
        ip_address=ip_address,
    )
    await db.commit()

    # Enqueue the Celery task after the DB commit so the task will always
    # find the sms_log row when it executes.
    if sms_log_id is not None:
        _enqueue_sms_reminder(sms_log_id)

    return _appointment_to_response(appt, patient)


async def get_appointment(
    db: AsyncSession,
    appointment_id: uuid.UUID,
) -> AppointmentResponse:
    """
    Fetch a single appointment with its patient.

    Raises:
        NotFoundError: Appointment does not exist.
    """
    appt, patient = await _get_appointment_with_patient(db, appointment_id)
    return _appointment_to_response(appt, patient)


async def list_appointments(
    db: AsyncSession,
    *,
    patient_id: uuid.UUID | None = None,
    status: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[AppointmentResponse], int]:
    """
    Return a paginated list of appointments with optional filters.

    Args:
        db:         Active async session.
        patient_id: Filter by patient UUID.
        status:     Filter by appointment status string.
        from_date:  Lower bound on scheduled_at (date, inclusive).
        to_date:    Upper bound on scheduled_at (date, inclusive, end-of-day).
        page:       1-based page number.
        page_size:  Records per page (max 100 enforced here).

    Returns:
        Tuple of (list of AppointmentResponse, total count matching filters).
    """
    page_size = min(page_size, 100)  # cap page_size
    offset = (page - 1) * page_size

    base_query = (
        select(Appointment, Patient)
        .join(Patient, Patient.id == Appointment.patient_id)
    )

    if patient_id is not None:
        base_query = base_query.where(Appointment.patient_id == patient_id)
    if status is not None:
        base_query = base_query.where(Appointment.status == status)
    if from_date is not None:
        base_query = base_query.where(
            func.date(Appointment.scheduled_at) >= from_date
        )
    if to_date is not None:
        base_query = base_query.where(
            func.date(Appointment.scheduled_at) <= to_date
        )

    # Count total matching rows.
    count_result = await db.execute(
        select(func.count()).select_from(base_query.subquery())
    )
    total: int = count_result.scalar_one()

    # Fetch the page.
    rows_result = await db.execute(
        base_query.order_by(Appointment.scheduled_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = rows_result.all()

    items = [_appointment_to_response(appt, patient) for appt, patient in rows]
    return items, total


async def update_appointment(
    db: AsyncSession,
    appointment_id: uuid.UUID,
    data: AppointmentUpdate,
    updated_by_user_id: uuid.UUID,
    ip_address: str | None = None,
) -> AppointmentResponse:
    """
    Partial-update an appointment's fields.

    Only fields that are not None in ``data`` are applied.
    If ``scheduled_at`` is updated, it must be a future datetime.

    After a reschedule (scheduled_at changes), the original SMS reminder
    may fire at the wrong time — a new reminder is NOT automatically queued
    here; the scheduler will pick it up on the next hourly run if the new
    time falls within the window.  This is intentional to avoid duplicate
    reminder sending.

    Args:
        db:                   Active async session.
        appointment_id:       UUID of the appointment to update.
        data:                 AppointmentUpdate with partial fields.
        updated_by_user_id:   UUID of the staff user performing the update.
        ip_address:           Client IP for audit log.

    Returns:
        Updated AppointmentResponse.

    Raises:
        NotFoundError:   Appointment does not exist.
        ValidationError: New scheduled_at is in the past.
    """
    appt, patient = await _get_appointment_with_patient(db, appointment_id)

    changed_fields: dict[str, Any] = {}

    if data.appointment_type is not None:
        appt.appointment_type = data.appointment_type
        changed_fields["appointment_type"] = data.appointment_type

    if data.scheduled_at is not None:
        now = datetime.now(tz=data.scheduled_at.tzinfo)
        if data.scheduled_at <= now:
            raise ValidationError(
                "scheduled_at must be a future datetime.",
                detail={"scheduled_at": str(data.scheduled_at)},
            )
        appt.scheduled_at = data.scheduled_at
        changed_fields["scheduled_at"] = data.scheduled_at.isoformat()

    if data.status is not None:
        appt.status = data.status
        changed_fields["status"] = data.status

    if data.notes is not None:
        appt.notes = data.notes
        changed_fields["notes"] = data.notes

    await db.flush()
    await db.commit()
    await db.refresh(appt)

    await write_audit_log(
        db=db,
        action="UPDATE",
        entity_type="appointment",
        user_id=updated_by_user_id,
        entity_id=appt.id,
        metadata={"changed_fields": changed_fields},
        ip_address=ip_address,
    )
    await db.commit()

    return _appointment_to_response(appt, patient)


async def cancel_appointment(
    db: AsyncSession,
    appointment_id: uuid.UUID,
    cancelled_by_user_id: uuid.UUID,
    ip_address: str | None = None,
) -> AppointmentResponse:
    """
    Cancel an appointment by setting status='cancelled'.

    Already-cancelled, completed, or missed appointments can still be
    "cancelled" via this endpoint (idempotent status update).

    Args:
        db:                     Active async session.
        appointment_id:         UUID of the appointment to cancel.
        cancelled_by_user_id:   UUID of the staff user cancelling.
        ip_address:             Client IP for audit log.

    Returns:
        Updated AppointmentResponse with status='cancelled'.

    Raises:
        NotFoundError: Appointment does not exist.
    """
    appt, patient = await _get_appointment_with_patient(db, appointment_id)

    previous_status = appt.status
    appt.status = "cancelled"
    await db.flush()
    await db.commit()
    await db.refresh(appt)

    await write_audit_log(
        db=db,
        action="DELETE",
        entity_type="appointment",
        user_id=cancelled_by_user_id,
        entity_id=appt.id,
        metadata={
            "previous_status": previous_status,
            "action_detail": "appointment cancelled",
        },
        ip_address=ip_address,
    )
    await db.commit()

    return _appointment_to_response(appt, patient)
