"""
Pre-visit patient intake endpoints.

Public routes (no JWT required):
  GET  /intake/{token}        — validate token, return draft_data
  PUT  /intake/{token}        — save patient-submitted draft data (rate-limited)

JWT-required routes:
  POST /intake/{token}/finalize — finalize draft, create patient record (BHW+)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.schemas.intake import IntakeDraftResponse, IntakeFinalizeResponse, PendingIntakeSummary
from app.schemas.patient import PatientCreate
from app.services import intake_service

router = APIRouter(prefix="/intake", tags=["intake"])
logger = get_logger(__name__)

_BHW_PLUS = require_role("bhw", "physician", "admin_staff", "admin")


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


# ---------------------------------------------------------------------------
# GET /intake/pending  — JWT required, BHW+
# ---------------------------------------------------------------------------


@router.get(
    "/pending",
    response_model=list[PendingIntakeSummary],
    summary="List pending (non-used, non-expired) intake tokens (BHW+)",
    dependencies=[_BHW_PLUS],
)
async def list_pending_intakes(
    db: DbDep,
    current_user: CurrentUser,
) -> list[PendingIntakeSummary]:
    tokens = await intake_service.list_pending_intakes(db)
    results = []
    for t in tokens:
        draft = t.draft_data or {}
        first = draft.get("first_name", "")
        last = draft.get("last_name", "")
        patient_name = f"{first} {last}".strip() if (first or last) else None
        results.append(
            PendingIntakeSummary(
                token=str(t.token),
                created_at=t.created_at,
                expires_at=t.expires_at,
                has_draft=bool(t.draft_data),
                patient_name=patient_name or None,
            )
        )
    return results


# ---------------------------------------------------------------------------
# GET /intake/{token}  — public, no JWT
# ---------------------------------------------------------------------------


@router.get(
    "/{token}",
    response_model=IntakeDraftResponse,
    summary="Get intake draft data for a token (public)",
)
async def get_intake_draft(
    token: str,
    db: DbDep,
) -> IntakeDraftResponse:
    try:
        intake_token = await intake_service.get_intake_token(db, token)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc

    return IntakeDraftResponse(
        token=str(intake_token.token),
        expires_at=intake_token.expires_at,
        draft_data=intake_token.draft_data,
    )


# ---------------------------------------------------------------------------
# PUT /intake/{token}  — public, no JWT, rate-limited
# ---------------------------------------------------------------------------


@router.put(
    "/{token}",
    status_code=status.HTTP_200_OK,
    summary="Save patient draft data for an intake token (public)",
)
async def save_intake_draft(
    request: Request,
    token: str,
    db: DbDep,
    payload: PatientCreate,
) -> dict:  # type: ignore[type-arg]
    ip = _get_client_ip(request) or "unknown"
    await limiter.check_rate_limit(
        key=f"intake_draft:{ip}",
        max_attempts=5,
        window_seconds=60,
    )

    try:
        await intake_service.save_draft(db, token, payload.model_dump())
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc

    logger.info("Intake draft saved", extra={"token": token, "ip": ip})
    return {"message": "Draft saved successfully.", "token": token}


# ---------------------------------------------------------------------------
# POST /intake/{token}/finalize  — JWT required, BHW+
# ---------------------------------------------------------------------------


@router.post(
    "/{token}/finalize",
    response_model=IntakeFinalizeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Finalize a pre-visit intake draft and create the patient record (BHW+)",
    dependencies=[_BHW_PLUS],
)
async def finalize_intake(
    request: Request,
    token: str,
    db: DbDep,
    current_user: CurrentUser,
) -> IntakeFinalizeResponse:
    ip = _get_client_ip(request)

    try:
        patient = await intake_service.finalize_intake(
            db=db,
            token_str=token,
            created_by_id=current_user.id,
            ip_address=ip,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        status_code = 410 if "expired" in str(exc).lower() or "already been used" in str(exc).lower() else 422
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc

    # Enqueue the same post-registration background tasks
    try:
        from app.workers.registration_tasks import (  # noqa: PLC0415
            queue_health_card_generation_task,
            send_photo_reminder_task,
            send_welcome_sms_task,
        )
        patient_id_str = str(patient.id)
        staff_id_str = str(current_user.id)

        if patient.mobile_number:
            send_welcome_sms_task.delay(patient_id_str)
        queue_health_card_generation_task.delay(patient_id_str)
        send_photo_reminder_task.apply_async(
            args=[patient_id_str, staff_id_str],
            countdown=86400,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Could not enqueue post-finalize tasks",
            extra={"patient_id": str(patient.id), "error": str(exc)},
        )

    return IntakeFinalizeResponse(
        patient_id=str(patient.id),
        patient_code=patient.patient_code,
        registration_data_source="pre_visit",
    )
