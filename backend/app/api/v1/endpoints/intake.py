"""
Pre-visit patient intake endpoints.

Public routes (no JWT required):
  GET  /intake/{token}        — validate token, return draft_data
  PUT  /intake/{token}        — save patient-submitted draft data (rate-limited)

JWT-required routes:
  POST /intake/send-link/{appointment_id} — generate token + send SMS link (BHW, admin_staff, admin)
  POST /intake/{token}/finalize           — finalize draft, create patient record (BHW+)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.schemas.intake import (
    IntakeDetailResponse,
    IntakeDraftPayload,
    IntakeDraftResponse,
    IntakeFinalizeResponse,
    IntakeLinkResponse,
    PendingIntakeSummary,
)
from app.services import intake_service

router = APIRouter(prefix="/intake", tags=["intake"])
logger = get_logger(__name__)

_BHW_PLUS = require_role("bhw", "physician", "admin_staff", "admin")
_SEND_LINK_ROLES = require_role("bhw", "admin_staff", "admin")


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
                visit_purpose=t.visit_purpose,
            )
        )
    return results


# ---------------------------------------------------------------------------
# GET /intake/{token}/details  — JWT required, BHW+
# Must be declared BEFORE GET /{token} to prevent path capture by wildcard.
# ---------------------------------------------------------------------------


@router.get(
    "/{token}/details",
    response_model=IntakeDetailResponse,
    summary="Get full intake detail including purpose-specific fields (BHW+)",
    dependencies=[_BHW_PLUS],
)
async def get_intake_detail(
    token: str,
    db: DbDep,
    current_user: CurrentUser,
    request: Request,
) -> IntakeDetailResponse:
    from app.services.audit_service import write_audit_log  # noqa: PLC0415

    try:
        intake_token = await intake_service.get_intake_token(db, token)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc

    ip = _get_client_ip(request)

    await write_audit_log(
        db=db,
        action="INTAKE_DETAIL_VIEW",
        entity_type="intake_token",
        user_id=current_user.id,
        entity_id=intake_token.id,
        metadata={
            "viewer_role": current_user.role,
            "visit_purpose": intake_token.visit_purpose,
        },
        ip_address=ip,
    )

    return IntakeDetailResponse(
        token=str(intake_token.token),
        expires_at=intake_token.expires_at,
        used_at=intake_token.used_at,
        visit_purpose=intake_token.visit_purpose,
        purpose_details=intake_token.purpose_details,
        draft_data=intake_token.draft_data,
        patient_id=str(intake_token.patient_id) if intake_token.patient_id else None,
        appointment_id=str(intake_token.appointment_id) if intake_token.appointment_id else None,
        created_at=intake_token.created_at,
    )


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
        visit_purpose=intake_token.visit_purpose,
        purpose_details=intake_token.purpose_details,
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
    payload: IntakeDraftPayload,
) -> dict:  # type: ignore[type-arg]
    ip = _get_client_ip(request) or "unknown"
    await limiter.check_rate_limit(
        key=f"intake_draft:{ip}",
        max_attempts=5,
        window_seconds=60,
    )

    try:
        await intake_service.save_draft(db, token, payload.model_dump(), ip_address=ip)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc

    logger.info("Intake draft saved", extra={"token": token, "ip": ip})
    return {"message": "Draft saved successfully.", "token": token}


# ---------------------------------------------------------------------------
# POST /intake/send-link/{appointment_id}  — JWT required, BHW / admin_staff / admin
# ---------------------------------------------------------------------------


@router.post(
    "/send-link/{appointment_id}",
    response_model=IntakeLinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate an intake token for an appointment and send the link via SMS (BHW+)",
    dependencies=[_SEND_LINK_ROLES],
)
async def send_intake_link(
    appointment_id: uuid.UUID,
    request: Request,
    db: DbDep,
    current_user: CurrentUser,
) -> IntakeLinkResponse:
    """
    Create a pre-visit intake token tied to an existing appointment and send
    the self-registration link to the patient's mobile number via SMS.

    When the patient submits the form at the intake URL the appointment is
    automatically marked ``intake_completed = True``.

    **Required roles:** bhw, admin_staff, admin

    **Returns:**
    ```json
    {
      "token": "<uuid>",
      "intake_url": "http://localhost:3000/intake/<uuid>",
      "sms_sent": true
    }
    ```

    **Raises:**
    - 404 if the appointment or linked patient does not exist.
    - 409 if the appointment already has a completed intake.
    """
    import sqlalchemy as sa  # noqa: PLC0415

    from app.core.config import settings  # noqa: PLC0415
    from app.models.appointment import Appointment  # noqa: PLC0415
    from app.models.patient import Patient  # noqa: PLC0415
    from app.services.audit_service import write_audit_log  # noqa: PLC0415
    from app.services.sms_service import SMSService  # noqa: PLC0415

    ip = _get_client_ip(request)

    # Fetch the appointment and its patient in a single JOIN.
    stmt = (
        sa.select(Appointment, Patient)
        .join(Patient, Appointment.patient_id == Patient.id)
        .where(Appointment.id == appointment_id)
    )
    result = await db.execute(stmt)
    row = result.first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found.",
        )

    appointment, patient = row

    if appointment.intake_completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This appointment already has a completed intake submission.",
        )

    # Generate an intake token pre-linked to this appointment.
    intake_token = await intake_service.generate_appointment_intake_token(
        db=db,
        appointment_id=appointment_id,
        created_by_id=current_user.id,
    )

    token_str = str(intake_token.token)
    intake_url = f"{settings.QR_BASE_URL}/intake/{token_str}"

    # Write audit log — staff action (not patient self-action).
    await write_audit_log(
        db=db,
        action="INTAKE_LINK_SENT",
        entity_type="appointment",
        user_id=current_user.id,
        entity_id=appointment_id,
        metadata={"intake_token": token_str, "intake_url": intake_url},
        ip_address=ip,
    )
    await db.commit()

    # Dispatch SMS — wrapped in try/except so a provider failure never blocks
    # the clinical workflow (rule §13.7).
    sms_sent = False
    if patient.mobile_number:
        sms_message = (
            f"Hi {patient.first_name}, please fill in your pre-visit health "
            f"information before your appointment at {settings.BHC_NAME}. "
            f"Click the link: {intake_url} "
            f"(expires in 48 hours)"
        )
        try:
            sms_svc = SMSService()
            await sms_svc.send_sms(patient.mobile_number, sms_message)
            sms_sent = True
            logger.info(
                "Intake link SMS dispatched",
                extra={
                    "appointment_id": str(appointment_id),
                    "mobile_number": patient.mobile_number,
                    "token": token_str,
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Failed to send intake link SMS — token still created",
                extra={
                    "appointment_id": str(appointment_id),
                    "error": str(exc),
                },
            )
    else:
        logger.warning(
            "No mobile number on patient — intake link SMS skipped",
            extra={"appointment_id": str(appointment_id), "patient_id": str(patient.id)},
        )

    return IntakeLinkResponse(
        token=token_str,
        intake_url=intake_url,
        sms_sent=sms_sent,
    )


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
        status_code = (
            410 if "expired" in str(exc).lower() or "already been used" in str(exc).lower() else 422
        )
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
