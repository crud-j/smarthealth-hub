"""
SMS-related endpoints — Phase 4.

Routes:
  GET  /sms/logs                    — paginated SMS dispatch log (Admin, BHW)
  POST /sms/send-manual             — ad-hoc SMS to patient (BHW+ roles)
  POST /sms/webhook/delivery-status — Semaphore delivery callback (PUBLIC, no JWT)

RELIABILITY NOTE (SDP Section 1.5):
  The webhook handler is best-effort and always returns HTTP 200 to Semaphore
  to prevent retries from flooding the log.  Errors during webhook processing
  are logged server-side and swallowed.

WEBHOOK SECURITY:
  If SEMAPHORE_WEBHOOK_SECRET is configured, the handler validates the
  X-Semaphore-Signature header using HMAC-SHA256.  If the secret is empty,
  validation is skipped (suitable for development/staging without a real key).

SDP Reference: Section 6.8, Section 9
"""

from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Header, Query, Request

from app.core.config import settings
from app.core.logging import get_logger
from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.schemas.sms_log import (
    DeliveryWebhookPayload,
    ManualSMSRequest,
    ManualSMSSentResponse,
    PaginatedSMSLogs,
    SMSLogResponse,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/sms", tags=["sms"])

# ---------------------------------------------------------------------------
# Role shorthands
# ---------------------------------------------------------------------------
_logs_role = require_role("admin", "bhw")
_send_role = require_role("admin", "bhw", "physician", "admin_staff")


# ---------------------------------------------------------------------------
# GET /sms/logs
# ---------------------------------------------------------------------------


@router.get(
    "/logs",
    summary="List SMS dispatch log",
    response_model=PaginatedSMSLogs,
    dependencies=[_logs_role],
)
async def list_sms_logs(
    db: DbDep,
    patient_id: Annotated[uuid.UUID | None, Query(description="Filter by patient UUID")] = None,
    status: Annotated[
        str | None,
        Query(description="Filter by status: queued | sent | delivered | failed"),
    ] = None,
    date_from: Annotated[date | None, Query(description="Lower bound on created_at (YYYY-MM-DD)")] = None,
    date_to: Annotated[date | None, Query(description="Upper bound on created_at (YYYY-MM-DD)")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PaginatedSMSLogs:
    """
    Return a paginated list of SMS log entries, sorted by ``created_at``
    descending.  Use the filters to drill down by patient, delivery status,
    or date range.

    **Required roles:** admin, bhw
    """
    from sqlalchemy import func, select
    from app.models.sms_log import SmsLog

    page_size = min(page_size, 100)
    offset = (page - 1) * page_size

    base_q = select(SmsLog)
    if patient_id is not None:
        base_q = base_q.where(SmsLog.patient_id == patient_id)
    if status is not None:
        base_q = base_q.where(SmsLog.status == status)
    if date_from is not None:
        base_q = base_q.where(func.date(SmsLog.created_at) >= date_from)
    if date_to is not None:
        base_q = base_q.where(func.date(SmsLog.created_at) <= date_to)

    count_result = await db.execute(
        select(func.count()).select_from(base_q.subquery())
    )
    total: int = count_result.scalar_one()

    rows_result = await db.execute(
        base_q.order_by(SmsLog.created_at.desc()).offset(offset).limit(page_size)
    )
    rows = rows_result.scalars().all()

    items = [SMSLogResponse.model_validate(row) for row in rows]
    return PaginatedSMSLogs(items=items, total=total, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# POST /sms/send-manual
# ---------------------------------------------------------------------------


@router.post(
    "/send-manual",
    summary="Send an ad-hoc SMS to a patient",
    status_code=202,
    response_model=ManualSMSSentResponse,
    dependencies=[_send_role],
)
async def send_manual_sms(
    body: ManualSMSRequest,
    db: DbDep,
    current_user: CurrentUser,
) -> ManualSMSSentResponse:
    """
    Enqueue an ad-hoc SMS (announcement, custom reminder) to a patient's
    registered mobile number.

    Returns HTTP 202 Accepted immediately.  Actual delivery is asynchronous —
    poll ``GET /sms/logs`` using the returned ``sms_log_id`` to track status.

    **Required roles:** admin, bhw, physician, admin_staff

    **Request body:**
    ```json
    {
      "patient_id": "<uuid>",
      "message": "Your prescription is ready for pickup at the BHC."
    }
    ```

    **Raises:**
    - 404 if patient not found or inactive.
    - 422 if patient has no registered mobile number.
    """
    from sqlalchemy import select
    from app.core.exceptions import NotFoundError, ValidationError
    from app.models.patient import Patient
    from app.models.sms_log import SmsLog

    # Load patient.
    result = await db.execute(
        select(Patient).where(
            Patient.id == body.patient_id,
            Patient.is_active.is_(True),
        )
    )
    patient: Patient | None = result.scalar_one_or_none()
    if patient is None:
        raise NotFoundError(f"Patient '{body.patient_id}' not found or is inactive.")

    if not patient.mobile_number:
        raise ValidationError(
            "Patient does not have a registered mobile number.",
            detail={"patient_id": str(body.patient_id)},
        )

    # Create sms_log row (status='queued').
    sms_log = SmsLog(
        id=uuid.uuid4(),
        patient_id=patient.id,
        mobile_number=patient.mobile_number,
        message=body.message,
        status="queued",
    )
    db.add(sms_log)
    await db.flush()
    sms_log_id = sms_log.id
    await db.commit()

    # Enqueue Celery task (fire-and-forget).
    try:
        from app.workers.sms_tasks import send_reminder_task
        send_reminder_task.delay(str(sms_log_id))
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Failed to enqueue manual SMS task — Celery/Redis may be unavailable",
            extra={"sms_log_id": str(sms_log_id), "error": str(exc)},
        )

    return ManualSMSSentResponse(sms_log_id=sms_log_id, status="queued")


# ---------------------------------------------------------------------------
# POST /sms/webhook/delivery-status  (PUBLIC — no JWT)
# ---------------------------------------------------------------------------


@router.post(
    "/webhook/delivery-status",
    summary="Semaphore delivery status callback (public)",
    # openapi_extra overrides the global bearerAuth security requirement so
    # Swagger UI shows an open-lock icon for this public endpoint.
    # JWT is deliberately NOT applied here — Semaphore calls this from its servers.
    openapi_extra={"security": []},
)
async def sms_delivery_status_webhook(
    body: DeliveryWebhookPayload,
    request: Request,
    db: DbDep,
    x_semaphore_signature: Annotated[str | None, Header()] = None,
) -> dict:  # type: ignore[type-arg]
    """
    Receive delivery status updates from Semaphore and update the matching
    ``sms_logs`` row.

    **This endpoint is public** (no JWT required) — Semaphore calls it from
    its own servers.  If ``SEMAPHORE_WEBHOOK_SECRET`` is configured, the
    ``X-Semaphore-Signature`` header is validated using HMAC-SHA256 before
    processing.

    **Always returns HTTP 200** — a non-200 would cause Semaphore to retry,
    flooding the log.  Processing errors are logged server-side only.

    **Semaphore status string → sms_logs.status mapping:**
    - "Sent"          → "sent"
    - "Delivered"     → "delivered"
    - "Failed"        → "failed"
    - "Undelivered"   → "failed"
    - "Expired"       → "failed"
    - (anything else) → unchanged

    **Example webhook payload from Semaphore:**
    ```json
    {
      "message_id": "12345678",
      "status": "Delivered"
    }
    ```
    """
    # -------------------------------------------------------------------
    # Optional HMAC-SHA256 signature validation
    # -------------------------------------------------------------------
    if settings.SEMAPHORE_WEBHOOK_SECRET:
        if x_semaphore_signature is None:
            logger.warning(
                "Semaphore webhook received without X-Semaphore-Signature header",
                extra={"remote": str(request.client)},
            )
            # Return 200 anyway — we don't want to break delivery if there's a
            # Semaphore configuration lag, but we log it prominently.
        else:
            raw_body = await request.body()
            expected_sig = hmac.new(
                settings.SEMAPHORE_WEBHOOK_SECRET.encode(),
                raw_body,
                hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(expected_sig, x_semaphore_signature):
                logger.error(
                    "Semaphore webhook signature mismatch — possible forgery",
                    extra={"remote": str(request.client)},
                )
                # Return 200 to prevent Semaphore retries, but do not process.
                return {"received": True, "processed": False, "reason": "invalid_signature"}

    # -------------------------------------------------------------------
    # Update sms_logs row matching the provider_message_id
    # -------------------------------------------------------------------
    try:
        from sqlalchemy import select
        from app.models.sms_log import SmsLog

        # Normalise Semaphore status strings to our internal status values.
        _status_map: dict[str, str] = {
            "sent": "sent",
            "delivered": "delivered",
            "failed": "failed",
            "undelivered": "failed",
            "expired": "failed",
        }
        normalised_status = _status_map.get(body.status.lower(), "")

        result = await db.execute(
            select(SmsLog).where(SmsLog.provider_message_id == body.message_id)
        )
        sms_log: SmsLog | None = result.scalar_one_or_none()

        if sms_log is None:
            logger.info(
                "Semaphore webhook: no sms_log found for message_id",
                extra={"message_id": body.message_id, "status": body.status},
            )
            return {"received": True, "processed": False, "reason": "not_found"}

        if normalised_status:
            sms_log.status = normalised_status
        # Always update provider_message_id in case it was missing (e.g. sim mode).
        sms_log.provider_message_id = body.message_id
        await db.commit()

        logger.info(
            "Semaphore webhook: sms_log status updated",
            extra={
                "sms_log_id": str(sms_log.id),
                "message_id": body.message_id,
                "semaphore_status": body.status,
                "normalised_status": normalised_status,
            },
        )
        return {
            "received": True,
            "processed": True,
            "sms_log_id": str(sms_log.id),
            "status": normalised_status or sms_log.status,
        }

    except Exception as exc:  # noqa: BLE001
        # Always return 200 — webhook must never trigger Semaphore retries.
        logger.error(
            "Semaphore webhook processing error",
            extra={"message_id": body.message_id, "error": str(exc)},
        )
        return {"received": True, "processed": False, "reason": "internal_error"}
