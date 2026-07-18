"""
Patient record endpoints — Phase 2 full implementation.

  GET    /patients              — paginated list / search
  POST   /patients              — register new patient
  GET    /patients/{id}         — full patient profile (audit VIEW_PHI)
  PUT    /patients/{id}         — update demographics (BHW+)
  DELETE /patients/{id}         — soft-deactivate (Admin only)
  GET    /patients/{id}/verify  — identity summary for card-scan flow

Auth: JWT required on all routes.
RBAC: POST/PUT require BHW, physician, or admin roles.
      DELETE requires admin role.
      GET routes require any authenticated user.

SDP Reference: Section 6.2
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.schemas.patient import (
    PaginatedPatients,
    PatientCreate,
    PatientResponse,
    PatientSummary,
    PatientUpdate,
    PatientVerifySummary,
)
from app.services import patient_service
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/patients", tags=["patients"])

# Roles permitted to create / update patient records (BHW, Physician/Nurse/Midwife, Admin)
_BHW_PLUS = require_role("bhw", "physician", "admin_staff", "admin")
# Admin-only for destructive operations
_ADMIN_ONLY = require_role("admin")


# ---------------------------------------------------------------------------
# GET /patients
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=PaginatedPatients,
    summary="List / search patients (paginated)",
)
async def list_patients(
    db: DbDep,
    current_user: CurrentUser,
    q: str | None = Query(None, description="Search by name, patient code, or mobile"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, description="Results per page"),
    is_senior: bool | None = Query(None, description="Filter senior citizens"),
    is_pwd: bool | None = Query(None, description="Filter PWD patients"),
    is_pregnant: bool | None = Query(None, description="Filter pregnant patients"),
) -> PaginatedPatients:
    """
    Return a paginated, searchable list of active patients.

    Text search (``q``) matches last_name, first_name, patient_code, or mobile_number.
    Demographic flag filters can be combined with text search.

    Response items are ``PatientSummary`` — no address, guardian, or PhilHealth
    details — safe for all authenticated staff roles.
    """
    patients, total = await patient_service.list_patients(
        db,
        q=q,
        page=page,
        page_size=page_size,
        is_senior=is_senior,
        is_pwd=is_pwd,
        is_pregnant=is_pregnant,
    )

    items = [
        PatientSummary(
            id=str(p.id),
            patient_code=p.patient_code,
            first_name=p.first_name,
            middle_name=p.middle_name,
            last_name=p.last_name,
            birth_date=p.birth_date,
            sex=p.sex,
            mobile_number=p.mobile_number,
            is_senior=p.is_senior,
            is_pwd=p.is_pwd,
            is_pregnant=p.is_pregnant,
            is_active=p.is_active,
        )
        for p in patients
    ]

    return PaginatedPatients(items=items, total=total, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# POST /patients
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=PatientResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new patient",
    dependencies=[_BHW_PLUS],
)
async def create_patient(
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
    payload: PatientCreate,
) -> PatientResponse:
    """
    Register a new patient.

    Auto-generates a ``patient_code`` (BHC-YYYY-NNNNNN) and sets ``is_senior``
    based on age at registration.  Writes a CREATE audit log entry.

    Auth: BHW, Physician/Nurse/Midwife, Admin Staff, Admin.
    """
    ip = _get_client_ip(request)
    patient = await patient_service.create_patient(
        db, data=payload, created_by_id=current_user.id, ip_address=ip
    )

    return PatientResponse(
        id=str(patient.id),
        patient_code=patient.patient_code,
        first_name=patient.first_name,
        middle_name=patient.middle_name,
        last_name=patient.last_name,
        birth_date=patient.birth_date,
        sex=patient.sex,
        civil_status=patient.civil_status,
        mobile_number=patient.mobile_number,
        address=patient.address,
        guardian_name=patient.guardian_name,
        guardian_contact=patient.guardian_contact,
        philhealth_no=patient.philhealth_no,
        philhealth_member_type=patient.philhealth_member_type,
        is_pwd=patient.is_pwd,
        is_senior=patient.is_senior,
        is_pregnant=patient.is_pregnant,
        is_active=patient.is_active,
        created_at=patient.created_at,
        updated_at=patient.updated_at,
    )


# ---------------------------------------------------------------------------
# GET /patients/{id}
# ---------------------------------------------------------------------------


@router.get(
    "/{patient_id}",
    response_model=PatientResponse,
    summary="Get full patient profile",
)
async def get_patient(
    request: Request,
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> PatientResponse:
    """
    Return the full patient profile.

    Writes a VIEW_PHI audit log entry — every access to a full patient
    record (which includes address and contact info) is logged.

    Auth: Any authenticated staff role.
    """
    ip = _get_client_ip(request)
    patient = await patient_service.get_patient(db, patient_id)

    # Audit every PHI view
    await write_audit_log(
        db=db,
        user_id=current_user.id,
        action="VIEW_PHI",
        entity_type="patient",
        entity_id=patient_id,
        metadata={"patient_code": patient.patient_code},
        ip_address=ip,
    )
    await db.commit()

    return PatientResponse(
        id=str(patient.id),
        patient_code=patient.patient_code,
        first_name=patient.first_name,
        middle_name=patient.middle_name,
        last_name=patient.last_name,
        birth_date=patient.birth_date,
        sex=patient.sex,
        civil_status=patient.civil_status,
        mobile_number=patient.mobile_number,
        address=patient.address,
        guardian_name=patient.guardian_name,
        guardian_contact=patient.guardian_contact,
        philhealth_no=patient.philhealth_no,
        philhealth_member_type=patient.philhealth_member_type,
        is_pwd=patient.is_pwd,
        is_senior=patient.is_senior,
        is_pregnant=patient.is_pregnant,
        is_active=patient.is_active,
        created_at=patient.created_at,
        updated_at=patient.updated_at,
    )


# ---------------------------------------------------------------------------
# PUT /patients/{id}
# ---------------------------------------------------------------------------


@router.put(
    "/{patient_id}",
    response_model=PatientResponse,
    summary="Update patient demographics",
    dependencies=[_BHW_PLUS],
)
async def update_patient(
    request: Request,
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    payload: PatientUpdate,
) -> PatientResponse:
    """
    Update patient demographics (PATCH-style — only supplied fields change).

    Re-computes ``is_senior`` if ``birth_date`` is changed.
    Writes an UPDATE audit log entry.

    Auth: BHW, Physician/Nurse/Midwife, Admin Staff, Admin.
    """
    ip = _get_client_ip(request)
    patient = await patient_service.update_patient(
        db, patient_id=patient_id, data=payload, updated_by_id=current_user.id, ip_address=ip
    )

    return PatientResponse(
        id=str(patient.id),
        patient_code=patient.patient_code,
        first_name=patient.first_name,
        middle_name=patient.middle_name,
        last_name=patient.last_name,
        birth_date=patient.birth_date,
        sex=patient.sex,
        civil_status=patient.civil_status,
        mobile_number=patient.mobile_number,
        address=patient.address,
        guardian_name=patient.guardian_name,
        guardian_contact=patient.guardian_contact,
        philhealth_no=patient.philhealth_no,
        philhealth_member_type=patient.philhealth_member_type,
        is_pwd=patient.is_pwd,
        is_senior=patient.is_senior,
        is_pregnant=patient.is_pregnant,
        is_active=patient.is_active,
        created_at=patient.created_at,
        updated_at=patient.updated_at,
    )


# ---------------------------------------------------------------------------
# DELETE /patients/{id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{patient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Soft-deactivate patient record (Admin only)",
    dependencies=[_ADMIN_ONLY],
)
async def deactivate_patient(
    request: Request,
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> Response:
    """
    Soft-deactivate a patient by setting ``is_active=False``.

    Data is never hard-deleted — the record remains for audit trail integrity.
    Writes a DELETE audit log entry.

    Auth: Admin only.
    """
    ip = _get_client_ip(request)
    await patient_service.deactivate_patient(
        db, patient_id=patient_id, by_id=current_user.id, ip_address=ip
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# GET /patients/{id}/verify
# ---------------------------------------------------------------------------


@router.get(
    "/{patient_id}/verify",
    response_model=PatientVerifySummary,
    summary="Verify patient identity via card scan (NFC/QR)",
)
async def verify_patient(
    request: Request,
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> PatientVerifySummary:
    """
    Return a minimal patient summary for the front-desk verification screen
    after a BHW scans or taps a patient's health card.

    Returns: patient_code, full_name, age, sex, priority flags (senior, PWD,
    pregnant), last_visit_date, card_status.

    Writes a VIEW_PHI audit log entry.

    Auth: Any authenticated staff role.
    """
    ip = _get_client_ip(request)
    return await patient_service.verify_patient(
        db, patient_id=patient_id, verified_by_id=current_user.id, ip_address=ip
    )


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------


def _get_client_ip(request: Request) -> str | None:
    """Extract the real client IP, respecting the X-Forwarded-For header."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None
