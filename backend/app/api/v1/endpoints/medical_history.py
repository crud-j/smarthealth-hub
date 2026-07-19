"""
Medical history and visit endpoints — Phase 2 full implementation.

Visit endpoints (aligned with RHU Patient Record form visit log):
  GET  /patients/{patient_id}/visits        — list visit summaries (no PHI)
  POST /patients/{patient_id}/visits        — log a new visit (with vital signs)
  GET  /visits/{visit_id}                   — get full visit with decrypted PHI

Medical history endpoints (fully implemented):
  GET  /patients/{patient_id}/medical-history              — list all condition
       entries (notes always omitted; ``redacted`` flag per item)
  POST /patients/{patient_id}/medical-history              — add a new condition
       entry (Physician/Admin only; notes AES-256-GCM encrypted before storage)
  GET  /patients/{patient_id}/medical-history/{entry_id}  — get a single entry;
       notes decrypted for Physician/Admin, withheld for BHW/admin_staff

SECURITY:
  - ``diagnosis`` and ``treatment_notes`` on visits are AES-256-GCM encrypted
    before storage.  Decryption occurs in memory in the service layer for
    authorized roles only.
  - GET /visits/{visit_id} is restricted to clinical roles (physician, admin)
    and always writes a VIEW_PHI audit log.
  - ``medical_history.notes`` is AES-256-GCM encrypted before storage.
    It is decrypted only for Physician/Admin callers on the single-entry
    endpoint.  All list views redact notes for every role.
  - Every write to medical_history writes a CREATE audit log row.
  - Every access to a single medical_history entry writes a VIEW_PHI audit row.

SDP Reference: Section 6.3
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, status

from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.schemas.medical_history import (
    MedicalHistoryCreate,
    MedicalHistoryListResponse,
    MedicalHistoryResponse,
)
from app.schemas.visit import VisitCreate, VisitResponse, VisitSummary
from app.services import patient_service, visit_service
from app.services import medical_history_service

router = APIRouter(tags=["medical-history"])

# Clinical roles that may create visits or access decrypted PHI
_CLINICAL = require_role("physician", "bhw", "admin")
# Roles that may read decrypted PHI on individual visit records or add medical history
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
# Medical history: list all entries
# ---------------------------------------------------------------------------


@router.get(
    "/patients/{patient_id}/medical-history",
    response_model=MedicalHistoryListResponse,
    summary="List all medical history entries for a patient (no PHI)",
)
async def list_medical_history(
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> MedicalHistoryListResponse:
    """
    Returns all condition/diagnosis entries recorded for the specified patient,
    ordered from most recently added to oldest.

    ``notes`` (encrypted clinical comments) are **never** included in the list
    view for any role — this is a deliberate PHI minimisation measure.  Each
    item carries a ``redacted`` flag that is ``True`` when notes exist for that
    entry, enabling clinical-role UIs to show a "view notes" action that calls
    the single-entry endpoint.

    A top-level ``redacted`` field on the envelope is ``True`` when *any* entry
    in the list has notes, so the frontend can render a single advisory banner.

    Auth: Any authenticated staff role (admin, bhw, physician, admin_staff).
    No PHI is returned — no VIEW_PHI audit entry is written for this endpoint.
    """
    # Validate patient exists — raises NotFoundError (HTTP 404) if not found
    await patient_service.get_patient(db, patient_id)

    return await medical_history_service.list_medical_history(db, patient_id)


# ---------------------------------------------------------------------------
# Medical history: add entry (Physician / Admin only)
# ---------------------------------------------------------------------------


@router.post(
    "/patients/{patient_id}/medical-history",
    response_model=MedicalHistoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a new medical history entry (Physician/Admin only)",
    dependencies=[_PHI_READ],
)
async def add_medical_history(
    request: Request,
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    payload: MedicalHistoryCreate,
) -> MedicalHistoryResponse:
    """
    Adds a new condition entry to a patient's permanent medical history.

    ``condition_name`` is required.  ``severity``, ``diagnosed_date``, and
    ``notes`` are optional.

    PHI handling:
    - ``notes`` is supplied as plaintext in the request body.
    - The service layer encrypts it with AES-256-GCM (AES-256 key, random
      12-byte nonce per call) before inserting into the database.
    - The response returns ``notes`` as **decrypted plaintext** — callers at
      this endpoint already hold Physician/Admin role, so decryption is safe.

    Writes a CREATE audit log row (action="CREATE", entity_type="medical_history").

    Auth: Physician/Nurse/Midwife or Admin only (per SDP Section 10.3 RBAC matrix).
    """
    # Validate patient exists — raises NotFoundError (HTTP 404) if not found
    await patient_service.get_patient(db, patient_id)

    ip = _get_client_ip(request)
    return await medical_history_service.add_medical_history(
        db,
        patient_id=patient_id,
        data=payload,
        recorded_by_id=current_user.id,
        ip_address=ip,
    )


# ---------------------------------------------------------------------------
# Medical history: get single entry (with role-based PHI access)
# ---------------------------------------------------------------------------


@router.get(
    "/patients/{patient_id}/medical-history/{entry_id}",
    response_model=MedicalHistoryResponse,
    summary="Get a single medical history entry (notes for Physician/Admin only)",
)
async def get_medical_history_entry(
    request: Request,
    patient_id: uuid.UUID,
    entry_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> MedicalHistoryResponse:
    """
    Returns a single medical history entry.

    ``notes`` access is role-gated:
    - **Physician / Admin**: ``notes`` is returned as decrypted plaintext.
    - **BHW / Admin Staff**: ``notes`` is ``None`` and ``redacted=True``
      indicates that notes exist but were withheld.

    A VIEW_PHI audit log row is written on every call (regardless of whether
    notes are actually decrypted) — accessing an individual record's identity
    and metadata is itself a PHI-adjacent event that should be traceable.

    Auth: Any authenticated staff role.  Role determines whether ``notes``
    is returned or withheld.
    """
    # Validate patient exists — raises NotFoundError (HTTP 404) if not found
    await patient_service.get_patient(db, patient_id)

    # Determine whether the caller's role permits decrypted notes
    include_notes: bool = current_user.role.name in ("physician", "admin")

    ip = _get_client_ip(request)
    return await medical_history_service.get_medical_history_entry(
        db,
        entry_id=entry_id,
        accessed_by_id=current_user.id,
        include_notes=include_notes,
        ip_address=ip,
    )


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
