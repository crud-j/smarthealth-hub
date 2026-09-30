"""
Immunization record endpoints — full Phase 2 implementation.

Routes use full paths (patient_id + immunization_id in path) and are
mounted without a prefix on the API router.

  GET    /patients/{patient_id}/immunizations                         — list records
  POST   /patients/{patient_id}/immunizations                         — record new dose
  PATCH  /patients/{patient_id}/immunizations/{immunization_id}       — update record
  DELETE /patients/{patient_id}/immunizations/{immunization_id}       — delete record (Physician only)
  GET    /immunizations/due                                            — due/overdue list

RBAC (RBAC matrix §11):
  GET endpoints    — any authenticated staff role
  POST             — Physician, Nurse/Midwife (physician role), BHW, Admin
  PATCH            — Physician, Nurse/Midwife (physician role), BHW, Admin
  DELETE           — Physician (physician role), Admin

Audit: every CREATE / UPDATE / DELETE writes an audit_logs row (inside the
service layer).

SDP Reference: Section 6.4
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, Request, Response, status

from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.schemas.immunization import (
    ImmunizationCreate,
    ImmunizationDueSummary,
    ImmunizationListResponse,
    ImmunizationResponse,
    ImmunizationUpdate,
    ImmunizationWithPatientResponse,
    PaginatedImmunizationsWithPatient,
)
from app.services import immunization_service

router = APIRouter(tags=["immunizations"])

# ---------------------------------------------------------------------------
# Role groups
# ---------------------------------------------------------------------------

# BHW, Physician/Nurse/Midwife, Admin — may record and update doses
_BHW_PLUS = require_role("bhw", "physician", "admin", "admin_staff")

# Physician/Nurse/Midwife and Admin — may delete records
_PHYSICIAN_PLUS = require_role("physician", "admin")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_client_ip(request: Request) -> str | None:
    """Extract real client IP, respecting X-Forwarded-For."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _build_response(rec: object) -> ImmunizationResponse:
    """
    Map an Immunization ORM instance to ImmunizationResponse.

    Explicitly constructs the schema because the ORM uses UUID columns that
    need to be serialized as strings.
    """
    from app.models.immunization import Immunization as ImmunizationModel  # noqa: PLC0415

    r: ImmunizationModel = rec  # type: ignore[assignment]
    return ImmunizationResponse(
        id=str(r.id),
        patient_id=str(r.patient_id),
        vaccine_name=r.vaccine_name,
        dose_number=r.dose_number,
        date_administered=r.date_administered,
        administered_by=str(r.administered_by) if r.administered_by else None,
        batch_number=r.batch_number,
        next_due_date=r.next_due_date,
        notes=r.notes,
        status=r.status,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


# ---------------------------------------------------------------------------
# GET /patients/{patient_id}/immunizations
# ---------------------------------------------------------------------------


@router.get(
    "/patients/{patient_id}/immunizations",
    response_model=ImmunizationListResponse,
    summary="List immunization records for a patient",
)
async def list_immunizations(
    patient_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, description="Records per page"),
) -> ImmunizationListResponse:
    """
    Return a paginated list of immunization records for ``patient_id``,
    ordered by date administered (oldest first).

    Auth: Any authenticated staff role.
    """
    records, total = await immunization_service.list_immunizations(
        db, patient_id, page=page, page_size=page_size
    )
    return ImmunizationListResponse(
        items=[_build_response(r) for r in records],
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# POST /patients/{patient_id}/immunizations
# ---------------------------------------------------------------------------


@router.post(
    "/patients/{patient_id}/immunizations",
    response_model=ImmunizationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a new immunization dose",
    dependencies=[_BHW_PLUS],
)
async def create_immunization(
    patient_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
    payload: ImmunizationCreate,
) -> ImmunizationResponse:
    """
    Record a new vaccine dose for the patient.

    Writes a CREATE audit log entry.  If ``next_due_date`` is set and the
    Celery reminder scheduler is running, an SMS reminder will be enqueued
    automatically by the beat schedule.

    Auth: BHW, Physician/Nurse/Midwife, Admin.
    """
    ip = _get_client_ip(request)
    record = await immunization_service.create_immunization(
        db,
        patient_id=patient_id,
        data=payload,
        created_by_id=current_user.id,
        ip_address=ip,
    )
    return _build_response(record)


# ---------------------------------------------------------------------------
# PATCH /patients/{patient_id}/immunizations/{immunization_id}
# ---------------------------------------------------------------------------


@router.patch(
    "/patients/{patient_id}/immunizations/{immunization_id}",
    response_model=ImmunizationResponse,
    summary="Update an immunization record",
    dependencies=[_BHW_PLUS],
)
async def update_immunization(
    patient_id: uuid.UUID,
    immunization_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
    payload: ImmunizationUpdate,
) -> ImmunizationResponse:
    """
    Partial-update an existing immunization record.

    Only supplied (non-None) fields are changed.  Writes an UPDATE audit log
    entry.  Commonly used to mark a dose 'completed', record a batch number,
    or update the next_due_date.

    Auth: BHW, Physician/Nurse/Midwife, Admin.
    """
    ip = _get_client_ip(request)
    record = await immunization_service.update_immunization(
        db,
        immunization_id=immunization_id,
        patient_id=patient_id,
        data=payload,
        updated_by_id=current_user.id,
        ip_address=ip,
    )
    return _build_response(record)


# ---------------------------------------------------------------------------
# DELETE /patients/{patient_id}/immunizations/{immunization_id}
# ---------------------------------------------------------------------------


@router.delete(
    "/patients/{patient_id}/immunizations/{immunization_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete an immunization record (Physician / Admin only)",
    dependencies=[_PHYSICIAN_PLUS],
)
async def delete_immunization(
    patient_id: uuid.UUID,
    immunization_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> Response:
    """
    Hard-delete an immunization record.

    Writes a DELETE audit log entry.

    Auth: Physician/Nurse/Midwife, Admin.
    """
    ip = _get_client_ip(request)
    await immunization_service.delete_immunization(
        db,
        immunization_id=immunization_id,
        patient_id=patient_id,
        deleted_by_id=current_user.id,
        ip_address=ip,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# GET /immunizations/due
# ---------------------------------------------------------------------------


@router.get(
    "/immunizations/due",
    response_model=list[ImmunizationResponse],
    summary="List all patients with upcoming or overdue doses",
)
async def list_due_immunizations(
    db: DbDep,
    current_user: CurrentUser,
    days_ahead: int = Query(
        7,
        ge=0,
        le=90,
        description="How many days ahead to look for upcoming doses (default 7)",
    ),
) -> list[ImmunizationResponse]:
    """
    Return all scheduled immunizations whose ``next_due_date`` is today or
    within ``days_ahead`` days (includes overdue records).

    Used by the immunization tracking board and the SMS reminder scheduler.

    Auth: Any authenticated staff role.
    """
    records = await immunization_service.list_due(db, days_ahead=days_ahead)
    return [_build_response(r) for r in records]


# ---------------------------------------------------------------------------
# GET /immunizations/due-summary
# ---------------------------------------------------------------------------


@router.get(
    "/immunizations/due-summary",
    response_model=ImmunizationDueSummary,
    summary="Get counts of immunizations due this week and this month",
)
async def get_due_summary(
    db: DbDep,
    current_user: CurrentUser,
) -> ImmunizationDueSummary:
    """
    Return ``{due_this_week, due_this_month}`` counts of scheduled immunizations
    that are overdue or due within 7 / 30 days respectively.

    Used by the immunization tracking board stats bar.

    Auth: Any authenticated staff role.
    """
    summary = await immunization_service.get_due_summary(db)
    return ImmunizationDueSummary(**summary)


# ---------------------------------------------------------------------------
# GET /immunizations — cross-patient paginated list with patient name
# ---------------------------------------------------------------------------


@router.get(
    "/immunizations",
    response_model=PaginatedImmunizationsWithPatient,
    summary="Cross-patient immunization list (paginated, with patient name)",
)
async def list_all_immunizations(
    db: DbDep,
    current_user: CurrentUser,
    vaccine_name: str | None = Query(None, description="Filter by vaccine name"),
    due_filter: str | None = Query(
        None,
        description="due_this_week | due_this_month | overdue",
    ),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, description="Records per page"),
) -> PaginatedImmunizationsWithPatient:
    """
    Return a paginated, cross-patient list of immunization records including
    each patient's full name.  Used by the /immunizations dashboard page.

    Auth: Any authenticated staff role.
    """
    rows, total = await immunization_service.list_all_immunizations(
        db,
        vaccine_name=vaccine_name,
        due_filter=due_filter,
        page=page,
        page_size=page_size,
    )
    items = [
        ImmunizationWithPatientResponse(
            id=str(rec.id),
            patient_id=str(rec.patient_id),
            vaccine_name=rec.vaccine_name,
            dose_number=rec.dose_number,
            date_administered=rec.date_administered,
            administered_by=str(rec.administered_by) if rec.administered_by else None,
            batch_number=rec.batch_number,
            next_due_date=rec.next_due_date,
            notes=rec.notes,
            status=rec.status,
            created_at=rec.created_at,
            updated_at=rec.updated_at,
            patient_name=patient_name,
        )
        for rec, patient_name in rows
    ]
    return PaginatedImmunizationsWithPatient(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# GET /immunizations/stats — total count + distinct vaccines
# ---------------------------------------------------------------------------


@router.get(
    "/immunizations/stats",
    response_model=dict,
    summary="Get aggregate stats: total records and distinct vaccine count",
)
async def get_immunization_stats(
    db: DbDep,
    current_user: CurrentUser,
) -> dict:
    """
    Return ``{total_records, distinct_vaccines}`` for the immunization
    tracking board stats bar.

    Auth: Any authenticated staff role.
    """
    total = await immunization_service.count_total_immunizations(db)
    distinct = await immunization_service.count_distinct_vaccines(db)
    return {"total_records": total, "distinct_vaccines": distinct}
