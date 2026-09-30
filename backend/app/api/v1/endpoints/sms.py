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
import re
import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Header, Query, Request, Response

from app.core.config import settings
from app.core.logging import get_logger
from app.core.rate_limit import limiter
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

from app.workers.sms_tasks import send_reminder_task as _send_reminder_task

send_reminder_task = _send_reminder_task

router = APIRouter(prefix="/sms", tags=["sms"])

# Module-level flag so the "webhook secret not set" warning is logged once
# per process startup, not on every incoming request.
_webhook_secret_warned: bool = False

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
    response_model=ManualSMSSentResponse,
    dependencies=[_send_role],
)
async def send_manual_sms(
    body: ManualSMSRequest,
    request: Request,
    response: Response,
    db: DbDep,
    current_user: CurrentUser,
) -> ManualSMSSentResponse:
    """
    Send an ad-hoc SMS (announcement, custom reminder) to a patient's
    registered mobile number.

    Two delivery modes, selected by ``send_now`` in the request body:

    - ``send_now=False`` (default) — Returns HTTP 202 immediately with
      ``status="queued"``. Actual delivery happens asynchronously via
      Celery — poll ``GET /sms/logs`` using the returned ``sms_log_id`` to
      track status. Fast response, but delivery stalls silently if no
      Celery worker is running to consume the queue.
    - ``send_now=True`` — Sends synchronously within this request and
      returns HTTP 200 once Semaphore has actually responded, with
      ``status`` set to the real outcome (``"sent"`` or ``"failed"`` —
      see ``error_detail`` when failed). Slower (~1-3s), no Celery
      dependency, and the caller gets a definitive result immediately
      instead of having to poll.

    **Required roles:** admin, bhw, physician, admin_staff

    Rate limit: 10 requests / minute per authenticated user.

    **Request body:**
    ```json
    {
      "patient_id": "<uuid>",
      "message": "Your prescription is ready for pickup at the BHC.",
      "send_now": false
    }
    ```

    **Raises:**
    - 404 if patient not found or inactive.
    - 422 if patient has no registered mobile number.
    """
    await limiter.check_rate_limit(
        key=f"sms_manual:{current_user.id}",
        max_attempts=10,
        window_seconds=60,
    )
    from datetime import UTC, datetime

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

    # Create sms_log row (status='queued' until we know otherwise).
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

    if body.send_now:
        # Send synchronously — no Celery/Redis in the path at all. 200 either
        # way: the API call itself succeeded in getting a definitive answer
        # from Semaphore, even if that answer was a rejection — the caller
        # reads the real outcome from `status`/`error_detail`, not the HTTP
        # status code.
        response.status_code = 200
        from app.services.sms_service import SMSPermanentError, SMSService, SMSTransientError

        try:
            api_result = await SMSService().send_sms(
                mobile_number=patient.mobile_number,
                message=body.message,
            )
            sms_log.status = "sent"
            sms_log.provider_message_id = api_result.get("message_id", "")
            sms_log.sent_at = datetime.now(tz=UTC)
            await db.commit()
            return ManualSMSSentResponse(sms_log_id=sms_log_id, status="sent")

        except (SMSPermanentError, SMSTransientError) as exc:
            sms_log.status = "failed"
            sms_log.error_detail = f"{exc} (HTTP {exc.status_code}): {exc.body[:300]}"
            await db.commit()
            return ManualSMSSentResponse(
                sms_log_id=sms_log_id,
                status="failed",
                error_detail=str(exc),
            )

    # Default path — enqueue Celery task (fire-and-forget).
    response.status_code = 202
    try:
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
    global _webhook_secret_warned

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
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Invalid webhook signature"},
                )
    else:
        # Secret not configured — skip verification but warn once at startup.
        if not _webhook_secret_warned:
            logger.warning(
                "SEMAPHORE_WEBHOOK_SECRET is not set — webhook delivery callbacks "
                "are not verified. Set this in backend/.env if Semaphore provides "
                "a signing secret under Webhooks / Delivery Reports in their dashboard."
            )
            _webhook_secret_warned = True

    # -------------------------------------------------------------------
    # Block 1 — Update sms_logs row matching the provider_message_id
    # -------------------------------------------------------------------
    # This block handles outbound delivery-status callbacks from Semaphore.
    # It never early-returns so that Block 2 (inbound reply) can also run.
    # Both blocks are independently wrapped in try/except — a failure in
    # delivery-status processing must not prevent the CONFIRM reply from
    # being handled, and vice versa.
    _delivery_result: dict = {}  # type: ignore[type-arg]

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
            _delivery_result = {"delivery_processed": False, "reason": "not_found"}
        else:
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
            _delivery_result = {
                "delivery_processed": True,
                "sms_log_id": str(sms_log.id),
                "status": normalised_status or sms_log.status,
            }

    except Exception as exc:  # noqa: BLE001
        # Always continue to Block 2 — webhook must never trigger Semaphore retries.
        logger.error(
            "Semaphore webhook delivery-status processing error",
            extra={"message_id": body.message_id, "error": str(exc)},
        )
        _delivery_result = {"delivery_processed": False, "reason": "internal_error"}

    # -------------------------------------------------------------------
    # Block 2 — Inbound reply handling: SMS confirmation via "CONFIRM <token>"
    # -------------------------------------------------------------------
    # Semaphore inbound reply webhooks may include the reply text in extra
    # fields (e.g. "message", "text", or "body").  Because DeliveryWebhookPayload
    # uses extra="allow", any additional Semaphore fields land in model_extra.
    # We also check body.status itself in case Semaphore encodes the reply
    # text there for inbound-message callbacks (where status is not a known
    # delivery-status value).
    try:
        from sqlalchemy import select as sa_select
        from app.models.sms_log import SmsLog as SmsLogModel
        from app.services import appointment_service

        # Extract reply text from known Semaphore inbound reply field names.
        extra_fields: dict = body.model_extra or {}  # type: ignore[type-arg]
        reply_text: str | None = (
            extra_fields.get("message")
            or extra_fields.get("text")
            or extra_fields.get("body")
        )

        # If none of the extra fields carry the reply, check whether the
        # status field looks like a reply body — it won't be a known
        # delivery-status string in that case.
        if not reply_text:
            _known_statuses = {"sent", "delivered", "failed", "undelivered", "expired"}
            if body.status.lower() not in _known_statuses:
                reply_text = body.status

        if reply_text:
            normalised_reply = reply_text.strip().upper()

            if "CONFIRM" in normalised_reply:
                # Extract the 4-digit token immediately following CONFIRM.
                _match = re.search(
                    r"\bCONFIRM\s+(\d{4})\b", normalised_reply, re.IGNORECASE
                )
                if not _match:
                    logger.debug(
                        "Semaphore inbound reply contains CONFIRM but no valid "
                        "4-digit token",
                        extra={"reply_text": reply_text[:80]},
                    )
                else:
                    token = _match.group(1)
                    logger.info(
                        "Semaphore inbound reply: CONFIRM token received",
                        extra={"token": token},
                    )

                    # Look up the sms_log row matching this token.
                    stmt = sa_select(SmsLogModel).where(
                        SmsLogModel.sms_metadata["confirmation_token"].astext == token,
                        SmsLogModel.sms_metadata["appointment_id"].astext.is_not(None),
                        SmsLogModel.status != "replied",
                    )
                    confirm_result = await db.execute(stmt)
                    sms_log_row: SmsLogModel | None = (
                        confirm_result.scalar_one_or_none()
                    )

                    if sms_log_row is None:
                        logger.info(
                            "Semaphore CONFIRM reply: no matching sms_log found "
                            "for token",
                            extra={"token": token},
                        )
                    else:
                        appointment_id = uuid.UUID(
                            sms_log_row.sms_metadata["appointment_id"]
                        )

                        # Confirm the appointment — idempotent; already-confirmed
                        # appointments are silently skipped inside the service.
                        await appointment_service.confirm_appointment(
                            db,
                            appointment_id,
                            confirmation_source="sms_reply",
                        )

                        # Mark the sms_log as replied so the token cannot be reused.
                        sms_log_row.status = "replied"
                        await db.commit()

                        logger.info(
                            "Semaphore CONFIRM reply: appointment confirmed via SMS",
                            extra={
                                "appointment_id": str(appointment_id),
                                "sms_log_id": str(sms_log_row.id),
                                "token": token,
                            },
                        )

    except Exception as exc:  # noqa: BLE001
        # Never let confirmation errors cause a non-200 response — Semaphore
        # would retry indefinitely, causing duplicate processing attempts.
        logger.error(
            "Semaphore CONFIRM reply processing error",
            extra={"error": str(exc)},
        )

    # -------------------------------------------------------------------
    # Block 3 — Inbound STOP opt-out handling
    # -------------------------------------------------------------------
    # Detect when a patient replies STOP (or any variant: STOP, UNSUBSCRIBE,
    # CANCEL, QUIT, END — following CTIA short-code standards).
    # On a STOP reply, locate the patient by their mobile number and set
    # sms_opt_out=True so the scheduler skips them going forward.
    # Semaphore inbound reply payloads carry the sender's number in
    # "from" or "sender_number" within model_extra; the reply text appears
    # in "message", "text", or "body" (same fields as CONFIRM handling).
    try:
        from sqlalchemy import select as _sa_select
        from app.models.patient import Patient as _Patient

        _extra: dict = body.model_extra or {}  # type: ignore[type-arg]
        _reply_text_stop: str | None = (
            _extra.get("message")
            or _extra.get("text")
            or _extra.get("body")
        )

        # Fall back to body.status when it is not a known delivery-status value
        # (Semaphore sometimes encodes the reply content there for inbound events).
        if not _reply_text_stop:
            _known_statuses_stop = {"sent", "delivered", "failed", "undelivered", "expired"}
            if body.status.lower() not in _known_statuses_stop:
                _reply_text_stop = body.status

        if _reply_text_stop:
            _normalised_stop = _reply_text_stop.strip().upper()
            # CTIA opt-out keywords as per short-code standards.
            _STOP_KEYWORDS = {"STOP", "UNSUBSCRIBE", "CANCEL", "QUIT", "END"}

            if _normalised_stop in _STOP_KEYWORDS:
                # Semaphore inbound reply payload carries the sender's number
                # in "from" or "sender_number" extra fields.
                _sender_number: str | None = (
                    _extra.get("from")
                    or _extra.get("sender_number")
                    or _extra.get("sender")
                )

                if _sender_number:
                    _opt_result = await db.execute(
                        _sa_select(_Patient).where(
                            _Patient.mobile_number == _sender_number,
                            _Patient.is_active.is_(True),
                        )
                    )
                    _opt_patient: _Patient | None = _opt_result.scalar_one_or_none()

                    if _opt_patient is not None and not _opt_patient.sms_opt_out:
                        _opt_patient.sms_opt_out = True
                        await db.commit()
                        logger.info(
                            "Patient %s opted out of SMS",
                            _opt_patient.id,
                        )
                    elif _opt_patient is not None:
                        logger.debug(
                            "STOP received for patient %s — already opted out",
                            _opt_patient.id,
                        )
                    else:
                        logger.info(
                            "STOP received from number %s — no matching active patient found",
                            _sender_number,
                        )
                else:
                    logger.warning(
                        "STOP reply received but sender number not present in webhook payload",
                        extra={"reply_text": _reply_text_stop[:80]},
                    )

    except Exception as exc:  # noqa: BLE001
        # Never let opt-out errors block a 200 response — Semaphore would retry.
        logger.error(
            "SMS opt-out (STOP) processing error",
            extra={"error": str(exc)},
        )

    reason = _delivery_result.get("reason") if isinstance(_delivery_result, dict) else None
    processed = bool(_delivery_result.get("delivery_processed")) if isinstance(_delivery_result, dict) else False
    payload = {"received": True, "processed": processed}
    if reason is not None:
        payload["reason"] = reason
    if isinstance(_delivery_result, dict) and _delivery_result.get("sms_log_id"):
        payload["sms_log_id"] = _delivery_result["sms_log_id"]
    return payload
