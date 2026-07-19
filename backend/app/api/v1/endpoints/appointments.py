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

from fastapi import APIRouter, Depends, Query, Request

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
    from_date: Annotated[date | None, Query(description="Lower bound on scheduled_at (YYYY-MM-DD)")] = None,
    to_date: Annotated[date | None, Query(description="Upper bound on scheduled_at (YYYY-MM-DD)")] = None,
    page: Annotated[int, Query(ge=1, description="Page number (1-based)")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Records per page (max 100)")] = 20,
) -> PaginatedAppointments:
    """
    Return a paginated, filterable list of appointments sorted by
    ``scheduled_at`` descending.

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
