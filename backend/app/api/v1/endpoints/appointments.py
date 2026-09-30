"""
Appointment management endpoints — Phase 4.

Routes:
  POST   /appointments              — create appointment + enqueue SMS reminder
  GET    /appointments              — paginated list with filters
  GET    /appointments/{id}         — single appointment detail
  PUT    /appointments/{id}         — partial update (reschedule / status change)
  DELETE /appointments/{id}         — cancel (sets status='cancelled')

Auth: JWT required on all routes.
RBAC:
  POST / PUT                        — Admin, BHW, Physician
  DELETE                            — Admin, BHW only
  GET (list + detail)               — all authenticated roles

SDP Reference: Section 6.5
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Request

from app.core.rate_limit import limiter
from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentResponse,
    AppointmentUpdate,
    PaginatedAppointments,
)
from app.services import appointment_service

router = APIRouter(prefix="/appointments", tags=["appointments"])

# ---------------------------------------------------------------------------
# Role dependency shorthands
# ---------------------------------------------------------------------------
_create_update_roles = require_role("admin", "bhw", "physician")
_cancel_roles = require_role("admin", "bhw")
_read_roles = require_role("admin", "bhw", "physician", "admin_staff")


@router.post(
    "",
    summary="Create a new appointment",
    status_code=201,
    response_model=AppointmentResponse,
    dependencies=[_create_update_roles],
)
async def create_appointment(
    body: AppointmentCreate,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> AppointmentResponse:
    """
    Schedule a new appointment for a patient.

    Automatically enqueues an SMS reminder task (fire-and-forget via Celery)
    ``SMS_REMINDER_LEAD_HOURS`` before the scheduled time if the patient has
    a registered mobile number.  A Redis/Celery outage does NOT block the
    appointment from being created.

    **Required roles:** admin, bhw, physician

    Rate limit: 30 requests / minute per authenticated user.

    **Request body:**
    ```json
    {
      "patient_id": "<uuid>",
      "appointment_type": "consultation",
      "scheduled_at": "2026-08-15T09:00:00+08:00",
      "notes": "Follow-up for hypertension"
    }
    ```

    **Status lifecycle:** pending → confirmed → completed | missed | cancelled

    **Raises:**
    - 404 if patient_id does not exist or patient is inactive.
    - 422 if scheduled_at is in the past.
    """
    await limiter.check_rate_limit(
        key=f"appointments_create:{current_user.id}",
        max_attempts=30,
        window_seconds=60,
    )
    return await appointment_service.create_appointment(
        db=db,
        data=body,
        created_by_user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
    )


@router.get(
    "",
    summary="List appointments with optional filters",
    response_model=PaginatedAppointments,
    dependencies=[_read_roles],
)
async def list_appointments(
    db: DbDep,
    patient_id: Annotated[uuid.UUID | None, Query(description="Filter by patient UUID")] = None,
    status: Annotated[
        str | None,
        Query(description="Filter by status: pending | confirmed | completed | missed | cancelled"),
    ] = None,
    from_date: Annotated[
        date | None, Query(description="Lower bound on scheduled_at (YYYY-MM-DD)")
    ] = None,
    to_date: Annotated[
        date | None, Query(description="Upper bound on scheduled_at (YYYY-MM-DD)")
    ] = None,
    page: Annotated[int, Query(ge=1, description="Page number (1-based)")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Records per page (max 100)")] = 20,
    sort: Annotated[
        str | None,
        Query(
            description="'scheduled_at' sorts soonest-first (ascending); omitted defaults to newest-first"
        ),
    ] = None,
) -> PaginatedAppointments:
    """
    Return a paginated, filterable list of appointments sorted by
    ``scheduled_at`` descending by default (pass ``sort=scheduled_at`` for
    ascending / soonest-first order, used by the dashboard upcoming panel).

    All query parameters are optional — omitting all filters returns all
    appointments (paginated).

    **Required roles:** admin, bhw, physician, admin_staff
    """
    items, total = await appointment_service.list_appointments(
        db=db,
        patient_id=patient_id,
        status=status,
        from_date=from_date,
        to_date=to_date,
        page=page,
        page_size=page_size,
        sort=sort,
    )
    return PaginatedAppointments(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{appointment_id}",
    summary="Get appointment detail",
    response_model=AppointmentResponse,
    dependencies=[_read_roles],
)
async def get_appointment(
    appointment_id: uuid.UUID,
    db: DbDep,
) -> AppointmentResponse:
    """
    Return full detail for a single appointment including denormalized
    patient name and code.

    **Required roles:** admin, bhw, physician, admin_staff

    **Raises:**
    - 404 if the appointment does not exist.
    """
    return await appointment_service.get_appointment(db=db, appointment_id=appointment_id)


@router.put(
    "/{appointment_id}",
    summary="Reschedule or update an appointment",
    response_model=AppointmentResponse,
    dependencies=[_create_update_roles],
)
async def update_appointment(
    appointment_id: uuid.UUID,
    body: AppointmentUpdate,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> AppointmentResponse:
    """
    Partially update an appointment's fields.

    Only non-null fields in the request body are applied.  Send only the
    fields you want to change.

    **Required roles:** admin, bhw, physician

    **Allowed status transitions:**
    pending → confirmed → completed | missed | cancelled

    **Request body (all fields optional):**
    ```json
    {
      "scheduled_at": "2026-08-16T10:00:00+08:00",
      "status": "confirmed",
      "notes": "Patient confirmed by phone"
    }
    ```

    **Raises:**
    - 404 if the appointment does not exist.
    - 422 if new scheduled_at is in the past.
    """
    return await appointment_service.update_appointment(
        db=db,
        appointment_id=appointment_id,
        data=body,
        updated_by_user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
    )


@router.post(
    "/{appointment_id}/send-reminder",
    summary="Send or resend an SMS reminder for an appointment",
    dependencies=[_read_roles],
)
async def send_appointment_reminder(
    appointment_id: uuid.UUID,
    db: DbDep,
) -> dict:  # type: ignore[type-arg]
    """
    Send (or resend) an SMS reminder to the patient for a specific appointment.

    Fetches the appointment and its associated patient, then dispatches an SMS
    via ``SMSService``.  SMS failures are caught and returned as
    ``{"sent": false, "error": "..."}`` — this endpoint **never** returns HTTP
    500 for an SMS delivery failure.

    **Required roles:** admin, bhw, physician, admin_staff

    **Returns:**
    - ``{"sent": true}`` on success.
    - ``{"sent": false, "error": "<reason>"}`` when the patient has no mobile
      number or the SMS provider returns an error.

    **Raises:**
    - 404 if the appointment does not exist.
    """
    from sqlalchemy import select

    from app.core.config import settings
    from app.core.exceptions import NotFoundError
    from app.core.logging import get_logger
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.services.sms_service import SMSPermanentError, SMSService, SMSTransientError

    _log = get_logger(__name__)

    # Load appointment + patient in one JOIN query.
    result = await db.execute(
        select(Appointment, Patient)
        .join(Patient, Patient.id == Appointment.patient_id)
        .where(Appointment.id == appointment_id)
    )
    row = result.first()
    if row is None:
        raise NotFoundError(f"Appointment '{appointment_id}' not found.")

    appt: Appointment = row[0]
    patient: Patient = row[1]

    if not patient.mobile_number:
        return {"sent": False, "error": "Patient has no registered mobile number."}

    # Format scheduled_at for the SMS body.
    formatted_date = appt.scheduled_at.strftime("%B %d, %Y at %I:%M %p")

    # Human-readable appointment type (replace underscores, title-case).
    appointment_type_label = appt.appointment_type.replace("_", " ").title()

    bhc_name: str = getattr(settings, "BHC_NAME", "Barangay Health Center")
    message = (
        f"Hi {patient.first_name}, this is a reminder for your "
        f"{appointment_type_label} appointment at {bhc_name} on "
        f"{formatted_date}. Please arrive on time."
    )

    try:
        await SMSService().send_sms(
            mobile_number=patient.mobile_number,
            message=message,
        )
        _log.info(
            "Appointment reminder SMS sent",
            extra={
                "appointment_id": str(appointment_id),
                "patient_id": str(patient.id),
            },
        )
        return {"sent": True}

    except (SMSPermanentError, SMSTransientError) as exc:
        _log.warning(
            "Appointment reminder SMS failed",
            extra={
                "appointment_id": str(appointment_id),
                "patient_id": str(patient.id),
                "error": str(exc),
            },
        )
        return {"sent": False, "error": str(exc)}

    except Exception as exc:  # noqa: BLE001
        _log.error(
            "Unexpected error sending appointment reminder SMS",
            extra={
                "appointment_id": str(appointment_id),
                "error": str(exc),
            },
        )
        return {"sent": False, "error": "Unexpected error — see server logs."}


@router.delete(
    "/{appointment_id}",
    summary="Cancel an appointment",
    response_model=AppointmentResponse,
    dependencies=[_cancel_roles],
)
async def cancel_appointment(
    appointment_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> AppointmentResponse:
    """
    Cancel an appointment by setting its status to 'cancelled'.

    This is a soft-cancel: the appointment row is retained for audit and
    analytics purposes.  Any pending Celery SMS reminder task will still
    execute but the scheduler idempotency guard will see the 'cancelled'
    status and not re-enqueue a new reminder.

    **Required roles:** admin, bhw

    **Raises:**
    - 404 if the appointment does not exist.
    """
    return await appointment_service.cancel_appointment(
        db=db,
        appointment_id=appointment_id,
        cancelled_by_user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
    )
