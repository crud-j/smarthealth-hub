"""
Medical history and visit endpoints — Phase 2 full implementation.

Visit endpoints (aligned with RHU Patient Record form visit log):
  GET  /patients/{patient_id}/visits   — list visit summaries (no PHI)
  POST /patients/{patient_id}/visits   — log a new visit (with vital signs)
  GET  /visits/{visit_id}              — get full visit with decrypted PHI

Medical history endpoints:
  GET  /patients/{patient_id}/medical-history  — list condition entries
  POST /patients/{patient_id}/medical-history  — add condition entry

SECURITY:
  - ``diagnosis`` and ``treatment_notes`` are AES-256-GCM encrypted before
    storage.  Decryption occurs in memory in the service layer for authorized
    roles only.
  - GET /visits/{visit_id} is restricted to clinical roles
    (physician, admin) and always writes a VIEW_PHI audit log.

SDP Reference: Section 6.3
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Request, status

from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.schemas.visit import VisitCreate, VisitResponse, VisitSummary
from app.services import patient_service, visit_service

router = APIRouter(tags=["medical-history"])

# Clinical roles that may create visits or access decrypted PHI
_CLINICAL = require_role("physician", "bhw", "admin")
# Roles that may read decrypted PHI on individual visit records
_PHI_READ = require_role("physician", "admin")


# ---------------------------------------------------------------------------
# Visit: list
# ---------------------------------------------------------------------------


@router.get(
    "/patients/{patient_id}/visits",
    response_model=list[VisitSummary],
    summary="List visit history for a patient (no PHI)",
)
async def list_visits(
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> list[VisitSummary]:
    """
    Return a chronological list of visit summaries for the given patient.

    The list view omits ``diagnosis`` and ``treatment_notes`` (PHI).  Use
    ``GET /visits/{visit_id}`` to retrieve the full record with decrypted PHI
    (clinical roles only).

    Auth: Any authenticated staff role.
    """
    # Validate patient exists (raises NotFoundError if not)
    await patient_service.get_patient(db, patient_id)
    return await visit_service.list_visits(db, patient_id)


# ---------------------------------------------------------------------------
# Visit: create
# ---------------------------------------------------------------------------


@router.post(
    "/patients/{patient_id}/visits",
    response_model=VisitResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Log a new visit / consultation",
    dependencies=[_CLINICAL],
)
async def create_visit(
    request: Request,
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    payload: VisitCreate,
) -> VisitResponse:
    """
    Log a new visit/consultation for the given patient.

    ``case_no`` is auto-generated (BHC-VISIT-YYYY-NNNNNN) if not supplied.
    ``vital_signs`` captures all fields from the VITAL SIGNS column on the RHU form.
    ``diagnosis`` and ``treatment_notes`` are encrypted with AES-256-GCM before storage.

    Writes a CREATE audit log entry.

    Auth: BHW, Physician/Nurse/Midwife, Admin.
    """
    # Validate patient exists
    await patient_service.get_patient(db, patient_id)

    ip = _get_client_ip(request)
    return await visit_service.create_visit(
        db,
        patient_id=patient_id,
        data=payload,
        recorded_by_id=current_user.id,
        ip_address=ip,
    )


# ---------------------------------------------------------------------------
# Visit: get by ID (with decrypted PHI)
# ---------------------------------------------------------------------------


@router.get(
    "/visits/{visit_id}",
    response_model=VisitResponse,
    summary="Get full visit record with decrypted PHI (clinical roles only)",
    dependencies=[_PHI_READ],
)
async def get_visit(
    request: Request,
    visit_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> VisitResponse:
    """
    Return the full visit record including decrypted ``diagnosis`` and
    ``treatment_notes``.

    Always writes a VIEW_PHI audit log entry — every access to the raw
    diagnosis and treatment notes is logged (who, when, IP).

    Auth: Physician/Nurse/Midwife, Admin only.
    """
    ip = _get_client_ip(request)
    return await visit_service.get_visit(
        db,
        visit_id=visit_id,
        accessed_by_id=current_user.id,
        ip_address=ip,
    )


# ---------------------------------------------------------------------------
# Medical history: list (stub — Phase 2 completion)
# ---------------------------------------------------------------------------


@router.get(
    "/patients/{patient_id}/medical-history",
    summary="List medical history entries for a patient",
)
async def list_medical_history(
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict[str, object]:
    """
    Returns all condition/diagnosis entries for the specified patient.

    Sensitive ``notes`` fields are decrypted only for Physician/Admin roles;
    BHW and Admin Staff receive a redacted view.

    Full implementation: Phase 2 medical history sub-module.
    """
    # Validate patient exists
    await patient_service.get_patient(db, patient_id)
    # Full medical history CRUD deferred to medical_history_service (Phase 2.2).
    # Returns empty list until implemented — visits are the primary clinical log.
    return {"patient_id": str(patient_id), "items": [], "total": 0}


# ---------------------------------------------------------------------------
# Medical history: add entry (stub — Phase 2 completion)
# ---------------------------------------------------------------------------


@router.post(
    "/patients/{patient_id}/medical-history",
    summary="Add a medical history entry",
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_role("physician", "admin")],
)
async def add_medical_history(
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> dict[str, object]:
    """
    Adds a new condition entry (condition_name, severity, diagnosed_date,
    encrypted notes) to the patient's medical history.

    Full implementation: Phase 2 medical history sub-module.
    """
    await patient_service.get_patient(db, patient_id)
    return {"message": "Medical history service — full implementation in Phase 2.2"}


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None
