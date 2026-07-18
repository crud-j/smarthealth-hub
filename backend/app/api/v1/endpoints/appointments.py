"""
Appointment management endpoints (Phase 4 stubs).

  GET    /appointments       — list appointments with filters (date, status, patient)
  POST   /appointments       — create appointment + enqueue SMS reminder via Celery
  GET    /appointments/{id}  — get appointment detail
  PUT    /appointments/{id}  — reschedule / update status (confirm, complete, cancel)
  DELETE /appointments/{id}  — cancel appointment and revoke pending SMS reminder task

Auth: JWT required on all routes.

SDP Reference: Section 6.5
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter

router = APIRouter(prefix="/appointments", tags=["appointments"])


@router.get("", summary="List appointments with optional filters")
async def list_appointments() -> dict[str, str]:
    """
    Returns a paginated list of appointments.

    Supports query params: patient_id, status, date_from, date_to, page, page_size.

    Auth: JWT required.
    Full implementation: Phase 4 — Appointments & SMS.
    """
    return {"message": "TODO: Phase 4 — list appointments"}


@router.post("", summary="Create a new appointment", status_code=201)
async def create_appointment() -> dict[str, str]:
    """
    Schedules a new appointment (patient_id, appointment_type, scheduled_at,
    notes).

    Automatically enqueues a Celery SMS reminder task configured for
    SMS_REMINDER_LEAD_HOURS before scheduled_at.

    Auth: JWT required.
    Full implementation: Phase 4 — Appointments & SMS.
    """
    return {"message": "TODO: Phase 4 — create appointment"}


@router.get("/{id}", summary="Get appointment detail")
async def get_appointment(id: uuid.UUID) -> dict[str, str]:
    """
    Returns full detail for a single appointment including patient summary,
    scheduled time, status, and any linked SMS log entries.

    Auth: JWT required.
    Full implementation: Phase 4 — Appointments & SMS.
    """
    return {"message": f"TODO: Phase 4 — get appointment {id}"}


@router.put("/{id}", summary="Reschedule or update appointment status")
async def update_appointment(id: uuid.UUID) -> dict[str, str]:
    """
    Updates appointment fields (scheduled_at, status, notes).

    When rescheduled, the existing Celery SMS task is revoked and a new one
    is enqueued for the updated time.

    Allowed status transitions:
      pending → confirmed → completed | missed | cancelled

    Auth: JWT required.
    Full implementation: Phase 4 — Appointments & SMS.
    """
    return {"message": f"TODO: Phase 4 — update appointment {id}"}


@router.delete("/{id}", summary="Cancel an appointment")
async def cancel_appointment(id: uuid.UUID) -> dict[str, str]:
    """
    Sets appointment status to 'cancelled' and revokes any pending Celery
    SMS reminder task associated with this appointment.

    Auth: JWT required.
    Full implementation: Phase 4 — Appointments & SMS.
    """
    return {"message": f"TODO: Phase 4 — cancel appointment {id}"}
