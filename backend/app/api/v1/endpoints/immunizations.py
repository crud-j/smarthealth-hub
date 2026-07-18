"""
Immunization record endpoints (Phase 2 stubs).

Routes use full paths (patient_id / immunization id in path) and are
mounted without a prefix on the API router.

  GET  /patients/{patient_id}/immunizations  — list immunization records
  POST /patients/{patient_id}/immunizations  — record a new immunization/dose
  PUT  /immunizations/{id}                   — update dose / next-due-date / status
  GET  /immunizations/due                    — all patients with upcoming/overdue doses

SDP Reference: Section 6.4
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter

router = APIRouter(tags=["immunizations"])


@router.get(
    "/patients/{patient_id}/immunizations",
    summary="List immunization records for a patient",
)
async def list_immunizations(patient_id: uuid.UUID) -> dict[str, str]:
    """
    Returns all immunization/dose records for the patient, including
    vaccine name, dose number, date administered, next due date, and status.

    Auth: JWT required.
    Full implementation: Phase 2 — Patient Records.
    """
    return {"message": f"TODO: Phase 2 — list immunizations for patient {patient_id}"}


@router.post(
    "/patients/{patient_id}/immunizations",
    summary="Record a new immunization dose",
    status_code=201,
)
async def create_immunization(patient_id: uuid.UUID) -> dict[str, str]:
    """
    Records a new immunization or dose (vaccine_name, dose_number,
    date_administered, next_due_date, status).

    Also enqueues an SMS reminder for the next_due_date via Celery (Phase 4).

    Auth: Physician, BHW, Admin.
    Full implementation: Phase 2 — Patient Records.
    """
    return {"message": f"TODO: Phase 2 — create immunization for patient {patient_id}"}


@router.put(
    "/immunizations/{id}",
    summary="Update an immunization record (dose, next-due-date, status)",
)
async def update_immunization(id: uuid.UUID) -> dict[str, str]:
    """
    Updates fields on an existing immunization record.
    Commonly used to mark a dose as 'completed', update the next_due_date,
    or record lot number after the fact.

    Auth: Physician, BHW, Admin.
    Full implementation: Phase 2 — Patient Records.
    """
    return {"message": f"TODO: Phase 2 — update immunization {id}"}


@router.get(
    "/immunizations/due",
    summary="List all patients with upcoming or overdue doses",
)
async def list_due_immunizations() -> dict[str, str]:
    """
    Returns a list of patients whose next_due_date is today or in the past
    (overdue) or within the next 7 days (upcoming), grouped by vaccine type.

    Used by the immunization tracking board and the SMS reminder scheduler.

    Auth: JWT required.
    Full implementation: Phase 2 — Patient Records.
    """
    return {"message": "TODO: Phase 2 — list due immunizations"}
