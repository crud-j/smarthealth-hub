"""
Online patient intake application endpoints.

Public routes (no JWT required):
  POST /intake-applications            — submit self-registration form

JWT-required routes (Admin only):
  GET  /intake-applications            — list with status/search filters
  GET  /intake-applications/{id}       — full detail for review
  POST /intake-applications/{id}/approve — approve → creates Patient record
  POST /intake-applications/{id}/reject  — reject with reason
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.schemas.intake_application import (
    IntakeApplicationApprove,
    IntakeApplicationCreate,
    IntakeApplicationDetail,
    IntakeApplicationPublicResponse,
    IntakeApplicationReject,
    IntakeApplicationSummary,
    IntakeApproveResponse,
    PaginatedIntakeApplications,
)
from app.services import intake_application_service

router = APIRouter(prefix="/intake-applications", tags=["intake-applications"])
logger = get_logger(__name__)

_ADMIN_ONLY = require_role("admin")


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


# ---------------------------------------------------------------------------
# POST /intake-applications  — public, no JWT, rate-limited
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=IntakeApplicationPublicResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a public self-registration application (no auth required)",
)
async def submit_application(
    request: Request,
    db: DbDep,
    payload: IntakeApplicationCreate,
) -> IntakeApplicationPublicResponse:
    """
    Submit a public online patient registration application.

    The application is stored with status='pending' and a reference number
    is returned to the applicant.  An Admin must review and approve the
    application before a patient record is created.

    Rate limit: 3 submissions per 10 minutes per IP (anti-spam).
    """
    ip = _get_client_ip(request)
    if ip:
        await limiter.check_rate_limit(
            key=f"intake_application:{ip}",
            max_attempts=3,
            window_seconds=600,
        )

    application = await intake_application_service.create_application(
        db=db,
        payload=payload,
        submitted_ip=ip,
    )

    logger.info(
        "Intake application submitted",
        extra={"reference_number": application.reference_number, "ip": ip},
    )

    return IntakeApplicationPublicResponse(
        reference_number=application.reference_number,
        status=application.status,
    )


# ---------------------------------------------------------------------------
# GET /intake-applications  — Admin only
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=PaginatedIntakeApplications,
    summary="List intake applications (Admin only)",
    dependencies=[_ADMIN_ONLY],
)
async def list_applications(
    db: DbDep,
    current_user: CurrentUser,
    status_filter: str | None = Query(
        None,
        alias="status",
        description="Filter by status: 'pending', 'approved', 'rejected'. Omit for all.",
    ),
    q: str | None = Query(None, description="Search by reference number or applicant name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedIntakeApplications:
    items, total = await intake_application_service.list_applications(
        db=db,
        status=status_filter,
        q=q,
        page=page,
        page_size=page_size,
    )
    summaries = [
        IntakeApplicationSummary.model_validate(
            intake_application_service.map_application_to_summary(app)
        )
        for app in items
    ]
    return PaginatedIntakeApplications(
        items=summaries,
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# GET /intake-applications/{id}  — Admin only
# ---------------------------------------------------------------------------


@router.get(
    "/{application_id}",
    response_model=IntakeApplicationDetail,
    summary="Get full detail of an intake application (Admin only)",
    dependencies=[_ADMIN_ONLY],
)
async def get_application(
    application_id: uuid.UUID,
    db: DbDep,
    current_user: CurrentUser,
) -> IntakeApplicationDetail:
    try:
        app = await intake_application_service.get_application(db, application_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return IntakeApplicationDetail.model_validate(
        intake_application_service.map_application_to_detail(app)
    )


# ---------------------------------------------------------------------------
# POST /intake-applications/{id}/approve  — Admin only
# ---------------------------------------------------------------------------


@router.post(
    "/{application_id}/approve",
    response_model=IntakeApproveResponse,
    status_code=status.HTTP_200_OK,
    summary="Approve an intake application — creates a Patient record (Admin only)",
    dependencies=[_ADMIN_ONLY],
)
async def approve_application(
    application_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
    body: IntakeApplicationApprove = IntakeApplicationApprove(),
) -> IntakeApproveResponse:
    """
    Approve a pending intake application.

    Creates a full Patient record by mapping the submitted form_data through
    the existing PatientCreate validation pipeline.  The application status
    is set to 'approved' and the patient_id FK is linked.

    Raises 404 if not found, 409 if already approved/rejected, 422 on
    data validation failure.
    """
    ip = _get_client_ip(request)
    try:
        patient = await intake_application_service.approve_application(
            db=db,
            application_id=application_id,
            reviewed_by_id=current_user.id,
            registration_source=body.registration_source,
            ip_address=ip,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        code = (
            status.HTTP_409_CONFLICT
            if "already" in str(exc).lower()
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise HTTPException(status_code=code, detail=str(exc)) from exc

    # Reload the application to get reference_number
    app = await intake_application_service.get_application(db, application_id)

    return IntakeApproveResponse(
        patient_id=str(patient.id),
        patient_code=patient.patient_code,
        reference_number=app.reference_number,
    )


# ---------------------------------------------------------------------------
# POST /intake-applications/{id}/reject  — Admin only
# ---------------------------------------------------------------------------


@router.post(
    "/{application_id}/reject",
    response_model=IntakeApplicationDetail,
    status_code=status.HTTP_200_OK,
    summary="Reject an intake application (Admin only)",
    dependencies=[_ADMIN_ONLY],
)
async def reject_application(
    application_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
    body: IntakeApplicationReject,
) -> IntakeApplicationDetail:
    ip = _get_client_ip(request)
    try:
        app = await intake_application_service.reject_application(
            db=db,
            application_id=application_id,
            reviewed_by_id=current_user.id,
            rejection_reason=body.rejection_reason,
            ip_address=ip,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return IntakeApplicationDetail.model_validate(
        intake_application_service.map_application_to_detail(app)
    )
