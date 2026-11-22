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
- complete_appointments_for_visit
                       Called when a visit is logged: the patient's
                       pending/confirmed/missed appointments on the visit's
                       Manila day become 'completed'; UPDATE audit log each.

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
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.appointment import Appointment
from app.models.intake_token import PatientIntakeToken
from app.models.patient import Patient
from app.models.visit import Visit
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentIntakeSummary,
    AppointmentResponse,
    AppointmentUpdate,
)
from app.services import patient_service, system_settings_service
from app.services.analytics_service import _invalidate_analytics_cache
from app.services.audit_service import write_audit_log
from app.utils.manila_time import to_manila

logger = get_logger(__name__)


async def _require_clinic_hours(db: AsyncSession, scheduled_at: datetime) -> None:
    """
    Refuse a time outside clinic hours (Manila time, Admin-editable on
    Settings; default 7:00 AM to 5:00 PM). Catches AM/PM slips such as a
    12:00 AM booking meant for noon.
    """
    runtime = await system_settings_service.load_runtime_settings(db)
    refusal = runtime.outside_clinic_hours(to_manila(scheduled_at).time())
    if refusal is not None:
        raise ValidationError(
            refusal,
            detail={
                "scheduled_at": scheduled_at.isoformat(),
                "clinic_open_time": runtime.clinic_open_time.strftime("%H:%M"),
                "clinic_close_time": runtime.clinic_close_time.strftime("%H:%M"),
            },
        )


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
        intake_completed=appt.intake_completed,
        intake_submitted_at=appt.intake_submitted_at,
    )


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
        NotFoundError:    Patient does not exist.
        ConflictError:    Patient is deactivated or archived.
        ValidationError:  scheduled_at is in the past.
    """
    patient = await patient_service.require_patient_in_use(db, data.patient_id)

    # Business rule: appointment must be in the future. scheduled_at always
    # carries a timezone (the schema pins a missing one to Manila), so this
    # compares real moments, not Manila wall time with the server's clock.
    if data.scheduled_at <= datetime.now(tz=UTC):
        raise ValidationError(
            "scheduled_at must be a future datetime.",
            detail={"scheduled_at": str(data.scheduled_at)},
        )
    await _require_clinic_hours(db, data.scheduled_at)

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

    await _invalidate_analytics_cache()

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

    Also loads the linked PatientIntakeToken (if any) to populate
    intake_summary with visit_purpose, purpose_details, and the
    patient name extracted from the draft submission.

    Raises:
        NotFoundError: Appointment does not exist.
    """
    appt, patient = await _get_appointment_with_patient(db, appointment_id)

    # Build the base response using the existing helper.
    response = _appointment_to_response(appt, patient)

    # Fetch linked intake token summary if any.
    token_result = await db.execute(
        select(PatientIntakeToken)
        .where(PatientIntakeToken.appointment_id == appt.id)
        .order_by(PatientIntakeToken.created_at.desc())
        .limit(1)
    )
    intake_token_row: PatientIntakeToken | None = token_result.scalar_one_or_none()

    intake_summary: AppointmentIntakeSummary | None = None
    if intake_token_row is not None:
        draft = intake_token_row.draft_data or {}
        first_name = draft.get("first_name") or draft.get("firstName") or ""
        last_name = draft.get("last_name") or draft.get("lastName") or ""
        patient_name = f"{first_name} {last_name}".strip() or None
        intake_summary = AppointmentIntakeSummary(
            token=str(intake_token_row.token),
            visit_purpose=intake_token_row.visit_purpose,
            purpose_details=intake_token_row.purpose_details,
            draft_submitted_at=intake_token_row.created_at,
            patient_name_from_draft=patient_name,
        )

    response.intake_summary = intake_summary
    return response


async def list_appointments(
    db: AsyncSession,
    *,
    patient_id: uuid.UUID | None = None,
    status: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    page: int = 1,
    page_size: int = 20,
    sort: str | None = None,
) -> tuple[list[AppointmentResponse], int]:
    """
    Return a paginated list of appointments with optional filters.

    Args:
        db:         Active async session.
        patient_id: Filter by patient UUID.
        status:     Filter by appointment status string.
        from_date:  First Manila calendar day to include (inclusive).
        to_date:    Last Manila calendar day to include (inclusive).
                    Both compare the Manila date of scheduled_at: the database
                    runs on UTC, where a 7:30 AM Manila booking falls on the
                    day before.
        page:       1-based page number.
        page_size:  Records per page (max 100 enforced here).
        sort:       Optional sort key. ``"scheduled_at"`` orders soonest-first
                     (ascending) — used by the dashboard "Upcoming Appointments"
                     panel. Any other value (or None) preserves the default
                     newest-scheduled-first (descending) ordering used by the
                     appointments list page.

    Returns:
        Tuple of (list of AppointmentResponse, total count matching filters).
    """
    page_size = min(page_size, 100)  # cap page_size
    offset = (page - 1) * page_size

    base_query = select(Appointment, Patient).join(Patient, Patient.id == Appointment.patient_id)

    if patient_id is not None:
        base_query = base_query.where(Appointment.patient_id == patient_id)
    if status is not None:
        base_query = base_query.where(Appointment.status == status)
    if from_date is not None:
        base_query = base_query.where(_manila_day(Appointment.scheduled_at) >= from_date)
    if to_date is not None:
        base_query = base_query.where(_manila_day(Appointment.scheduled_at) <= to_date)

    # Count total matching rows.
    count_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
    total: int = count_result.scalar_one()

    # Fetch the page. Default: newest-scheduled-first. sort="scheduled_at"
    # flips to soonest-first (ascending) for the dashboard upcoming panel.
    order_clause = (
        Appointment.scheduled_at.asc()
        if sort == "scheduled_at"
        else Appointment.scheduled_at.desc()
    )
    rows_result = await db.execute(
        base_query.order_by(order_clause).offset(offset).limit(page_size)
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
        if data.scheduled_at <= datetime.now(tz=UTC):
            raise ValidationError(
                "scheduled_at must be a future datetime.",
                detail={"scheduled_at": str(data.scheduled_at)},
            )
        await _require_clinic_hours(db, data.scheduled_at)
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


# Statuses a logged visit turns into 'completed'.  'missed' is included so a
# visit logged after the 18:00 mark-missed job corrects the record.
VISIT_COMPLETES_STATUSES = ("pending", "confirmed", "missed")


def _manila_day(column: Any) -> Any:
    """SQL: the Manila calendar date of a timestamptz column."""
    return func.date(func.timezone("Asia/Manila", column))


async def complete_appointments_for_visit(
    db: AsyncSession,
    *,
    patient_id: uuid.UUID,
    visit_id: uuid.UUID,
    user_id: uuid.UUID,
    ip_address: str | None = None,
) -> list[uuid.UUID]:
    """
    Mark the patient's appointments on the visit's day as completed.

    "Completed" was only a manual button, and the 18:00 job marks every
    appointment still pending/confirmed as missed (and texts the patient),
    so a patient who came was recorded as a no-show unless someone clicked.
    A logged visit is proof the patient came.

    Matches appointments of ``patient_id`` scheduled on the visit's Manila
    calendar day (computed in SQL from the stored visit row, so a naive
    default ``visit_date`` is read the same way as a client-supplied one)
    with status pending / confirmed / missed.  Cancelled and completed ones
    are left alone.  Writes one UPDATE audit row per appointment.  Does not
    commit: runs inside the caller's visit transaction.

    Returns the ids of the appointments it completed.
    """
    visit_day = select(_manila_day(Visit.visit_date)).where(Visit.id == visit_id).scalar_subquery()
    appointments = (
        (
            await db.execute(
                select(Appointment).where(
                    Appointment.patient_id == patient_id,
                    Appointment.status.in_(VISIT_COMPLETES_STATUSES),
                    _manila_day(Appointment.scheduled_at) == visit_day,
                )
            )
        )
        .scalars()
        .all()
    )

    completed: list[uuid.UUID] = []
    for appt in appointments:
        previous = appt.status
        appt.status = "completed"
        await write_audit_log(
            db=db,
            user_id=user_id,
            action="UPDATE",
            entity_type="appointment",
            entity_id=appt.id,
            metadata={
                "changed_fields": {"status": "completed"},
                "previous_status": previous,
                "trigger": "visit_logged",
                "visit_id": str(visit_id),
            },
            ip_address=ip_address,
        )
        completed.append(appt.id)

    if completed:
        logger.info(
            "Appointments completed by a logged visit",
            extra={"visit_id": str(visit_id), "appointment_ids": [str(i) for i in completed]},
        )
    return completed


async def confirm_appointment(
    db: AsyncSession,
    appointment_id: uuid.UUID,
    confirmation_source: str = "sms_reply",
) -> None:
    """
    Confirm an appointment by setting status='confirmed'.

    Called by the SMS inbound reply handler when a patient replies
    "CONFIRM <token>" to their appointment reminder SMS.

    Idempotent: if the appointment is already 'confirmed' or 'completed',
    this function returns without making any changes.  If the appointment
    does not exist (e.g. deleted after the reminder was sent), it also
    returns silently — the webhook handler must not raise a 500.

    Args:
        db:                   Active async session.
        appointment_id:       UUID of the appointment to confirm.
        confirmation_source:  Audit detail string (e.g. "sms_reply").
    """
    appointment: Appointment | None = await db.get(Appointment, appointment_id)
    if appointment is None:
        logger.info(
            "confirm_appointment: appointment not found — skipping",
            extra={"appointment_id": str(appointment_id)},
        )
        return

    if appointment.status in ("confirmed", "completed"):
        logger.info(
            "confirm_appointment: appointment already confirmed/completed — skipping",
            extra={
                "appointment_id": str(appointment_id),
                "current_status": appointment.status,
            },
        )
        return

    appointment.status = "confirmed"
    await db.flush()

    await write_audit_log(
        db=db,
        action="UPDATE",
        entity_type="appointment",
        user_id=None,  # system action — no human user performed this
        entity_id=appointment_id,
        metadata={"confirmed_via": confirmation_source},
    )
    await db.commit()

    logger.info(
        "confirm_appointment: appointment confirmed",
        extra={
            "appointment_id": str(appointment_id),
            "confirmation_source": confirmation_source,
        },
    )


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
