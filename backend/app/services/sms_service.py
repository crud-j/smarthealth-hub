"""
Provider-agnostic SMS service for SmartHealth Hub.

Supports four Philippine SMS providers selectable via SMS_PROVIDER in .env:

    SMS_PROVIDER=textbee     — textbee.dev Android-phone gateway (RECOMMENDED for PH
                               thesis deployments; no LOA, no sender registration,
                               works immediately with any Globe/Smart/DITO SIM)
    SMS_PROVIDER=semaphore   — Semaphore v4 API (use sender "Semaphore" if your custom
                               sender name was rejected — no LOA needed for "Semaphore")
    SMS_PROVIDER=itexmo      — iTExmo REST API (no LOA, immediate after signup)
    SMS_PROVIDER=philsms     — PhilSMS REST API (no LOA, free tier available)

Public API (unchanged — all callers continue working):
--------------------------------------------------
SMSTransientError  — Retriable error (network failure, 5xx from provider).
SMSPermanentError  — Non-retriable error (invalid number, 4xx, bad API key).
SMSSendError       — Alias for SMSTransientError (backward compat).
SMSService         — Async wrapper; ``send_sms(mobile_number, message) → dict``.

Usage::

    from app.services.sms_service import SMSService

    sms = SMSService()
    result = await sms.send_sms("+639171234567", "Your appointment is tomorrow at 9 AM.")
    # result = {"message_id": "...", "status": "queued"}

Dev mode:
    When the relevant API key setting is an empty string, ``send_sms`` logs a
    warning and returns a simulated success response so that local development
    works without a live provider account.  The simulated message_id is a UUID
    prefixed with "sim-".

Provider configuration reference
---------------------------------
textbee (recommended; sign up at textbee.dev — no LOA, no approval, PH SIM native):
    SMS_PROVIDER=textbee
    TEXTBEE_API_KEY=<your key from textbee.dev dashboard>
    TEXTBEE_DEVICE_ID=<device ID from textbee.dev dashboard>  ← optional; leave blank
                       for auto-selection (picks most-recently-seen device)
    TEXTBEE_BASE_URL=https://api.textbee.dev/api/v1

Semaphore (default, sender name "Semaphore" needs no LOA):
    SMS_PROVIDER=semaphore
    SEMAPHORE_API_KEY=<your key>
    SEMAPHORE_SENDER_NAME=Semaphore        ← use "Semaphore" to avoid LOA requirement
    SEMAPHORE_BASE_URL=https://api.semaphore.co/api/v4

iTExmo (no LOA required, works immediately after signup at itexmo.com):
    SMS_PROVIDER=itexmo
    ITEXMO_API_KEY=<your key>
    ITEXMO_EMAIL=<account email>
    ITEXMO_BASE_URL=https://api.itexmo.com/api

PhilSMS (no LOA required, free tier at philsms.com):
    SMS_PROVIDER=philsms
    PHILSMS_TOKEN=<bearer token>
    PHILSMS_SENDER_ID=PhilSMS              ← "PhilSMS" needs no LOA
    PHILSMS_BASE_URL=https://philsms.com/api/sms
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Exception hierarchy
# ---------------------------------------------------------------------------


class SMSTransientError(Exception):
    """
    Raised when the SMS provider is temporarily unavailable — network errors,
    request timeouts, or HTTP 5xx responses.

    Celery tasks that catch this should re-raise so autoretry fires with
    exponential backoff.

    Attributes:
        status_code: HTTP status code from the provider, or 0 for network/timeout.
        body:        Raw response text (may contain debugging detail).
    """

    def __init__(self, message: str, *, status_code: int = 0, body: str = "") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body

    def __repr__(self) -> str:
        return (
            f"SMSTransientError({self.args[0]!r}, "
            f"status_code={self.status_code}, body={self.body!r})"
        )


class SMSPermanentError(Exception):
    """
    Raised when the SMS provider rejects the request with a client error —
    invalid API key, invalid mobile number, blocked number, or 4xx response.

    Celery tasks that catch this should NOT retry; mark the sms_log as
    'failed' and move on.

    Attributes:
        status_code: HTTP status code from the provider.
        body:        Raw response text from the provider.
    """

    def __init__(self, message: str, *, status_code: int = 0, body: str = "") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body

    def __repr__(self) -> str:
        return (
            f"SMSPermanentError({self.args[0]!r}, "
            f"status_code={self.status_code}, body={self.body!r})"
        )


# Kept for backward compatibility — callers in Phase 1 (auth_service) reference this.
SMSSendError = SMSTransientError


# ---------------------------------------------------------------------------
# Internal provider implementations
# ---------------------------------------------------------------------------

_ProviderName = Literal["semaphore", "itexmo", "philsms", "textbee"]


async def _send_via_semaphore(mobile_number: str, message: str) -> dict:  # type: ignore[type-arg]
    """
    Dispatch via Semaphore v4 REST API.

    Endpoint: POST https://api.semaphore.co/api/v4/messages
    Auth:     API key in JSON body as "apikey" field (NOT an Authorization header).
    Number:   E.164 international format WITHOUT the leading "+" (639XXXXXXXXX).
              _normalize_ph_number_intl() handles 09XX, +639XX, and 639XX inputs.

    IMPORTANT: Set SEMAPHORE_SENDER_NAME=Semaphore (the platform default) to
    avoid the LOA requirement for custom sender names.  "Semaphore" is approved
    on all accounts with no paperwork.
    """
    if not settings.SEMAPHORE_API_KEY:
        return _dev_mode_response("semaphore", mobile_number, message)

    # Semaphore expects E.164 international format WITHOUT the leading "+".
    # Correct:  639171234567
    # Wrong:    +639171234567  (plus prefix — rejected)
    # Wrong:    09171234567    (local format — rejected)
    number = _normalize_ph_number_intl(mobile_number)

    payload = {
        "apikey": settings.SEMAPHORE_API_KEY,
        "number": number,
        "message": message,
        "sendername": settings.SEMAPHORE_SENDER_NAME,
    }

    logger.info(
        "Sending SMS via Semaphore",
        extra={
            "mobile_number": mobile_number,
            "normalized_number": number,
            "message_length": len(message),
            "sender_name": settings.SEMAPHORE_SENDER_NAME,
        },
    )

    resp = await _post_json(
        url=f"{settings.SEMAPHORE_BASE_URL}/messages",
        json_body=payload,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        provider="Semaphore",
        mobile_number=mobile_number,
    )

    # Semaphore reports an unapproved/invalid sender name as HTTP 500.
    # Treat it as permanent so a bad SEMAPHORE_SENDER_NAME fails fast instead
    # of burning all retries.  Fix: set SEMAPHORE_SENDER_NAME=Semaphore.
    if resp.is_error:
        _handle_error_response(
            resp,
            provider="Semaphore",
            mobile_number=mobile_number,
            permanent_hint="sendername" in resp.text.lower(),
            permanent_hint_message=(
                f"Semaphore rejected the configured sender name "
                f"(HTTP {resp.status_code}). "
                "Set SEMAPHORE_SENDER_NAME=Semaphore in .env to avoid the "
                "Letter of Authorization requirement."
            ),
        )

    raw: list | dict = resp.json()

    # Semaphore v4 returns a list of message objects for batch sends.
    if isinstance(raw, list) and raw:
        first = raw[0]
        return {
            "message_id": str(first.get("message_id", "")),
            "status": first.get("status", "queued"),
        }
    if isinstance(raw, dict):
        return {
            "message_id": str(raw.get("message_id", "")),
            "status": raw.get("status", "queued"),
        }

    logger.warning(
        "Unexpected Semaphore response shape",
        extra={"mobile_number": mobile_number, "raw": str(raw)[:200]},
    )
    return {"message_id": "", "status": "queued"}


async def _send_via_itexmo(mobile_number: str, message: str) -> dict:  # type: ignore[type-arg]
    """
    Dispatch via iTExmo REST API.

    iTExmo does NOT require a Letter of Authorization for sender names — all
    messages are delivered under the iTExmo platform sender.

    API reference: https://itexmo.com/pages/api-documentation
    Endpoint:  POST https://api.itexmo.com/api/broadcast
    Auth:      api_key + email in form body
    Response:  {"status": "OK", "message_count": N}
               {"status": "ERROR", "error": "...", "error_code": "..."}
    """
    if not settings.ITEXMO_API_KEY:
        return _dev_mode_response("itexmo", mobile_number, message)

    # iTExmo expects the Philippine mobile number in 09XXXXXXXXX format.
    number = _normalize_ph_number(mobile_number)

    payload = {
        "api_key": settings.ITEXMO_API_KEY,
        "email": settings.ITEXMO_EMAIL,
        "recipients": number,
        "message": message,
        "sending_method": "0",   # 0 = standard; 1 = priority
    }

    logger.info(
        "Sending SMS via iTExmo",
        extra={"mobile_number": mobile_number, "message_length": len(message)},
    )

    resp = await _post_form(
        url=f"{settings.ITEXMO_BASE_URL}/broadcast",
        data=payload,
        provider="iTExmo",
        mobile_number=mobile_number,
    )

    if resp.is_error:
        _handle_error_response(
            resp,
            provider="iTExmo",
            mobile_number=mobile_number,
        )

    raw = resp.json()

    # iTExmo returns {"status": "OK", "message_count": N} or {"status": "ERROR", ...}
    if isinstance(raw, dict):
        status = raw.get("status", "")
        if status == "ERROR":
            error_code = raw.get("error_code", "")
            error_msg = raw.get("error", str(raw))
            # P2P-style errors (bad number, insufficient credits) are permanent.
            permanent_codes = {"IE1", "IE2", "IE3", "IE4", "IE5", "IE9"}
            if error_code in permanent_codes:
                raise SMSPermanentError(
                    f"iTExmo permanent error [{error_code}]: {error_msg}",
                    status_code=200,
                    body=resp.text,
                )
            raise SMSTransientError(
                f"iTExmo error [{error_code}]: {error_msg}",
                status_code=200,
                body=resp.text,
            )
        # success: {"status": "OK", "message_count": 1, ...}
        # iTExmo does not return a per-message ID for single sends — generate one.
        msg_id = raw.get("message_id") or raw.get("batch_id") or f"itx-{uuid.uuid4().hex[:12]}"
        return {"message_id": str(msg_id), "status": "queued"}

    logger.warning(
        "Unexpected iTExmo response shape",
        extra={"mobile_number": mobile_number, "raw": str(raw)[:200]},
    )
    return {"message_id": f"itx-{uuid.uuid4().hex[:12]}", "status": "queued"}


async def _send_via_philsms(mobile_number: str, message: str) -> dict:  # type: ignore[type-arg]
    """
    Dispatch via PhilSMS REST API.

    PhilSMS does NOT require a Letter of Authorization when using the default
    sender_id "PhilSMS".  Set PHILSMS_SENDER_ID=PhilSMS in .env to use the
    no-LOA default.

    API reference: https://philsms.com/developers
    Endpoint:  POST https://dashboard.philsms.com/api/v3/sms/send
    Auth:      Authorization: Bearer <token>   (OAuth 2.0 Bearer — must include "Bearer " prefix)
    Body:      application/json  (Content-Type: application/json must be explicit)
    Response:  {"status": "success", "data": {"recipient": ..., "messageId": ...}}
               {"status": "error", "message": "..."}

    OPERATOR NOTE — Sender ID registration:
        PHILSMS_SENDER_ID=PhilSMS is the platform default and requires no registration.
        Any custom alphanumeric sender ID (e.g. "BHCHealth") MUST be registered in the
        PhilSMS dashboard under Settings → Sender IDs before use; unregistered IDs will
        cause the API to reject the request.
    """
    if not settings.PHILSMS_TOKEN:
        return _dev_mode_response("philsms", mobile_number, message)

    # Fix 1 — Mobile number format:
    #   PhilSMS expects E.164 international format WITHOUT the leading "+".
    #   Correct:  639171234567
    #   Wrong:    09171234567  (local format — will be rejected)
    #   Wrong:    +639171234567 (with "+" prefix — will be rejected)
    #   _normalize_ph_number_intl() converts any of the above to 639XXXXXXXXX.
    number = _normalize_ph_number_intl(mobile_number)

    payload = {
        "recipient": number,
        "sender_id": settings.PHILSMS_SENDER_ID,
        "type": "plain",
        "message": message,
    }

    logger.info(
        "Sending SMS via PhilSMS",
        extra={
            "mobile_number": mobile_number,
            "normalized_number": number,
            "message_length": len(message),
            "sender_id": settings.PHILSMS_SENDER_ID,
        },
    )

    # Fix 2 — Authorization header:
    #   Must be exactly "Bearer <token>" — the "Bearer " prefix is mandatory for
    #   OAuth 2.0 token auth.  Sending the raw token without the prefix causes HTTP 401.
    #
    # Fix 3 — Sender ID:
    #   PHILSMS_SENDER_ID defaults to "PhilSMS" (no registration needed).
    #   If a custom value is configured, it must be approved in the PhilSMS dashboard.
    #
    # Fix 4 — Content-Type:
    #   JSON requests must include Content-Type: application/json explicitly.
    #   httpx sets this automatically when using json=, but we also pass it in
    #   the headers dict to be explicit and future-proof against client changes.
    #
    # Fix 5 — Base URL path:
    #   The correct send endpoint path is /sms/send appended to the base URL.
    #   PHILSMS_BASE_URL must end without a trailing slash (e.g. "https://dashboard.philsms.com/api/v3/sms").
    #   If the env value has a trailing slash, strip it here to prevent double-slash URLs.
    base_url = settings.PHILSMS_BASE_URL.rstrip("/")
    send_url = f"{base_url}/send"

    resp = await _post_json(
        url=send_url,
        json_body=payload,
        headers={
            "Authorization": f"Bearer {settings.PHILSMS_TOKEN.strip()}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        provider="PhilSMS",
        mobile_number=mobile_number,
    )

    if resp.is_error:
        # PhilSMS returns HTTP 404 with a JSON body for sender-ID errors
        # (e.g. "Sender ID is not authorized").  This is a permanent configuration
        # error — do not retry.  Try to extract the JSON message for a clearer log.
        try:
            err_body = resp.json()
            err_msg: str = err_body.get("message", resp.text) if isinstance(err_body, dict) else resp.text
        except Exception:
            err_msg = resp.text

        sender_id_error = "not authorized" in err_msg.lower() or "sender id" in err_msg.lower()
        _handle_error_response(
            resp,
            provider="PhilSMS",
            mobile_number=mobile_number,
            permanent_hint=sender_id_error,
            permanent_hint_message=(
                f"PhilSMS rejected the configured sender ID "
                f"(HTTP {resp.status_code}): {err_msg}. "
                "Register the sender ID in the PhilSMS dashboard under "
                "Settings -> Sender IDs, or set PHILSMS_SENDER_ID=PhilSMS."
            ) if sender_id_error else "",
        )

    raw = resp.json()

    if isinstance(raw, dict):
        if raw.get("status") == "error":
            err_msg = raw.get("message", str(raw))
            # Treat sender-ID, invalid number, and authentication failures as permanent.
            permanent_keywords = ("invalid", "unauthorized", "forbidden", "blocked", "not authorized", "sender id")
            is_permanent = any(kw in err_msg.lower() for kw in permanent_keywords)
            if is_permanent:
                raise SMSPermanentError(
                    f"PhilSMS permanent error: {err_msg}",
                    status_code=200,
                    body=resp.text,
                )
            raise SMSTransientError(
                f"PhilSMS error: {err_msg}",
                status_code=200,
                body=resp.text,
            )
        data = raw.get("data", {})
        msg_id = (
            data.get("messageId")
            or data.get("message_id")
            or f"phs-{uuid.uuid4().hex[:12]}"
        )
        return {"message_id": str(msg_id), "status": "queued"}

    logger.warning(
        "Unexpected PhilSMS response shape",
        extra={"mobile_number": mobile_number, "raw": str(raw)[:200]},
    )
    return {"message_id": f"phs-{uuid.uuid4().hex[:12]}", "status": "queued"}


async def _send_via_textbee(mobile_number: str, message: str) -> dict:  # type: ignore[type-arg]
    """
    Dispatch via textbee.dev Android-phone SMS gateway.

    textbee.dev turns any Android phone into an SMS gateway — messages are
    dispatched by a physical device running the textbee app using its local
    SIM (Globe / Smart / DITO).  No LOA, no sender-name registration, no
    per-message fee.  Works immediately after registering a device at
    https://textbee.dev/dashboard.

    API reference: https://textbee.dev/docs
    Endpoint (device-scoped):
        POST https://api.textbee.dev/api/v1/gateway/devices/{deviceId}/send-sms
    Endpoint (auto-select device — omit deviceId):
        POST https://api.textbee.dev/api/v1/gateway/send-sms
    Auth:     x-api-key header
    Body:     {"recipients": ["+639XXXXXXXXX"], "message": "..."}
    Response: {"data": {"id": "<uuid>", ...}, "message": "SMS queued successfully"}
              or {"error": "...", "statusCode": 4XX}

    Delivery receipts:
        textbee does not currently support carrier-level delivery-receipt
        webhooks in the same format as Semaphore.  The sms_logs row will
        reach status="sent" (accepted by textbee) but not status="delivered"
        (confirmed by the recipient's carrier).  This is acceptable for the
        SmartHealth Hub thesis deployment.

    Device selection:
        If TEXTBEE_DEVICE_ID is set, messages are routed to that specific
        Android device.  If empty, textbee auto-selects the enabled device
        with the most-recent heartbeat.  For a single-phone setup (typical
        barangay health center), leave TEXTBEE_DEVICE_ID blank or set it to
        the ID shown in the textbee dashboard.

    PHI note:
        The message body (appointment name + date + type, not diagnoses or
        medical record numbers) transits the textbee cloud relay before being
        pushed to the Android device.  The existing SMS templates comply with
        the PHI-minimisation constraint.

    Number format:
        textbee accepts E.164 with a leading '+' (e.g. +639171234567).
        _normalize_ph_number_intl() returns 639XXXXXXXXX; we prepend '+' here.
    """
    if not settings.TEXTBEE_API_KEY:
        return _dev_mode_response("textbee", mobile_number, message)

    # textbee expects E.164 with the leading '+': +639XXXXXXXXX
    number_intl = _normalize_ph_number_intl(mobile_number)  # → 639XXXXXXXXX
    e164_number = f"+{number_intl}"

    payload: dict[str, object] = {
        "recipients": [e164_number],
        "message": message,
    }

    # Build the endpoint URL.
    # If TEXTBEE_DEVICE_ID is configured, use the device-scoped path so the
    # message always goes through the designated gateway phone.
    # If blank, use the device-agnostic endpoint and let textbee auto-select.
    base_url = settings.TEXTBEE_BASE_URL.rstrip("/")
    if settings.TEXTBEE_DEVICE_ID:
        send_url = f"{base_url}/gateway/devices/{settings.TEXTBEE_DEVICE_ID}/send-sms"
    else:
        send_url = f"{base_url}/gateway/send-sms"

    logger.info(
        "Sending SMS via textbee",
        extra={
            "mobile_number": mobile_number,
            "normalized_number": e164_number,
            "message_length": len(message),
            "device_id": settings.TEXTBEE_DEVICE_ID or "auto",
            "endpoint": send_url,
        },
    )

    resp = await _post_json(
        url=send_url,
        json_body=payload,
        headers={
            "x-api-key": settings.TEXTBEE_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        provider="textbee",
        mobile_number=mobile_number,
    )

    # textbee returns HTTP 4xx for bad API keys and invalid devices.
    # HTTP 5xx for server-side failures.
    if resp.is_error:
        # Try to extract the textbee error message for a cleaner log line.
        try:
            err_body = resp.json()
            err_msg: str = (
                err_body.get("error", "")
                or err_body.get("message", "")
                or resp.text
            ) if isinstance(err_body, dict) else resp.text
        except Exception:
            err_msg = resp.text

        # 401 / 403 → bad API key or device not owned — permanent.
        # 404 → device ID not found — permanent.
        # 5xx → transient.
        permanent = resp.status_code in (401, 403, 404)
        _handle_error_response(
            resp,
            provider="textbee",
            mobile_number=mobile_number,
            permanent_hint=permanent,
            permanent_hint_message=(
                f"textbee rejected the request (HTTP {resp.status_code}): {err_msg}. "
                "Check TEXTBEE_API_KEY and TEXTBEE_DEVICE_ID in .env."
            ) if permanent else "",
        )

    raw = resp.json()

    # Successful textbee response shape:
    # {"data": {"id": "<uuid>", "status": "queued", ...}, "message": "SMS queued successfully"}
    # Older shape (single recipient): {"data": {"id": ...}}
    if isinstance(raw, dict):
        data = raw.get("data") or {}
        if isinstance(data, list) and data:
            data = data[0]
        if isinstance(data, dict):
            msg_id = str(data.get("id", "") or f"tbee-{uuid.uuid4().hex[:12]}")
            return {"message_id": msg_id, "status": "queued"}
        # Fallback — textbee confirmed acceptance but shape is unexpected.
        return {"message_id": f"tbee-{uuid.uuid4().hex[:12]}", "status": "queued"}

    logger.warning(
        "Unexpected textbee response shape",
        extra={"mobile_number": mobile_number, "raw": str(raw)[:200]},
    )
    return {"message_id": f"tbee-{uuid.uuid4().hex[:12]}", "status": "queued"}


# ---------------------------------------------------------------------------
# Shared HTTP helpers
# ---------------------------------------------------------------------------


_REQUEST_TIMEOUT_SECONDS: float = 10.0


async def _post_form(
    *,
    url: str,
    data: dict,  # type: ignore[type-arg]
    provider: str,
    mobile_number: str,
) -> httpx.Response:
    """POST application/x-www-form-urlencoded, with consistent error wrapping."""
    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
            return await client.post(url, data=data)
    except httpx.TimeoutException as exc:
        logger.error(
            f"{provider} SMS request timed out",
            extra={"mobile_number": mobile_number},
        )
        raise SMSTransientError(
            f"SMS request to {provider} timed out after {_REQUEST_TIMEOUT_SECONDS}s",
            status_code=0,
            body="",
        ) from exc
    except httpx.RequestError as exc:
        logger.error(
            f"{provider} SMS network error",
            extra={"mobile_number": mobile_number, "error": str(exc)},
        )
        raise SMSTransientError(
            f"SMS network error ({provider}): {exc}",
            status_code=0,
            body="",
        ) from exc


async def _post_json(
    *,
    url: str,
    json_body: dict,  # type: ignore[type-arg]
    headers: dict,  # type: ignore[type-arg]
    provider: str,
    mobile_number: str,
) -> httpx.Response:
    """POST application/json, with consistent error wrapping."""
    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
            return await client.post(url, json=json_body, headers=headers)
    except httpx.TimeoutException as exc:
        logger.error(
            f"{provider} SMS request timed out",
            extra={"mobile_number": mobile_number},
        )
        raise SMSTransientError(
            f"SMS request to {provider} timed out after {_REQUEST_TIMEOUT_SECONDS}s",
            status_code=0,
            body="",
        ) from exc
    except httpx.RequestError as exc:
        logger.error(
            f"{provider} SMS network error",
            extra={"mobile_number": mobile_number, "error": str(exc)},
        )
        raise SMSTransientError(
            f"SMS network error ({provider}): {exc}",
            status_code=0,
            body="",
        ) from exc


def _handle_error_response(
    resp: httpx.Response,
    *,
    provider: str,
    mobile_number: str,
    permanent_hint: bool = False,
    permanent_hint_message: str = "",
) -> None:
    """
    Translate an HTTP error response into the correct exception type.

    This function always raises — callers must not continue after calling it.
    The return type annotation is ``None`` only because Python does not have
    a ``NoReturn`` that works well with the annotation checker here; the
    function never returns normally.
    """
    logger.error(
        f"{provider} SMS API returned error status",
        extra={
            "mobile_number": mobile_number,
            "status_code": resp.status_code,
            "body": resp.text[:500],
        },
    )

    if permanent_hint:
        raise SMSPermanentError(
            permanent_hint_message or f"{provider} permanent error (HTTP {resp.status_code})",
            status_code=resp.status_code,
            body=resp.text,
        )

    if resp.status_code >= 500:
        raise SMSTransientError(
            f"{provider} server error (HTTP {resp.status_code})",
            status_code=resp.status_code,
            body=resp.text,
        )

    # 4xx — permanent: invalid key, invalid number, etc.
    raise SMSPermanentError(
        f"{provider} client error (HTTP {resp.status_code})",
        status_code=resp.status_code,
        body=resp.text,
    )


def _dev_mode_response(provider: str, mobile_number: str, message: str) -> dict:  # type: ignore[type-arg]
    """Return a simulated success response when no API key is configured."""
    sim_id = f"sim-{uuid.uuid4().hex[:12]}"
    logger.warning(
        f"SMS provider '{provider}' API key is not set — simulating SMS send (dev mode)",
        extra={
            "mobile_number": mobile_number,
            "message_length": len(message),
            "simulated_message_id": sim_id,
        },
    )
    return {"message_id": sim_id, "status": "queued"}


def _normalize_ph_number(number: str) -> str:
    """
    Normalise a Philippine mobile number to 09XXXXXXXXX local format.

    Handles all common input variants:
        +639171234567  → 09171234567   (E.164 with plus)
        639171234567   → 09171234567   (international, no plus, 12 digits)
        09171234567    → 09171234567   (local — already correct)
        9171234567     → 09171234567   (bare 10-digit, leading 9)

    Used by iTExmo (expects 09XXXXXXXXX local format).
    """
    # Strip whitespace, spaces, dashes, and any leading "+" so we work on digits only.
    n = number.strip().replace(" ", "").replace("-", "").lstrip("+")
    if n.startswith("63") and len(n) == 12:
        # International 639XXXXXXXXX → local 09XXXXXXXXX
        n = "0" + n[2:]
    elif n.startswith("9") and len(n) == 10:
        # Bare 9XXXXXXXXX → local 09XXXXXXXXX
        n = "0" + n
    # If it already starts with "0" (11 digits) it is in local format — return as-is.
    return n


def _normalize_ph_number_intl(number: str) -> str:
    """
    Normalise a Philippine mobile number to 639XXXXXXXXX format (NO leading '+').

    PhilSMS requires E.164 international format WITHOUT the '+' prefix.
        Correct:  639171234567
        Wrong:    +639171234567   (plus prefix → API rejects)
        Wrong:    09171234567     (local format → API rejects)

    Handles all common input variants by delegating to _normalize_ph_number
    first (→ 09XXXXXXXXX), then converting to 639XXXXXXXXX.
    """
    n = _normalize_ph_number(number)   # → 09XXXXXXXXX
    if n.startswith("0"):
        n = "63" + n[1:]
    return n


# ---------------------------------------------------------------------------
# Provider dispatch table
# ---------------------------------------------------------------------------

_PROVIDER_DISPATCH: dict[str, object] = {
    "textbee": _send_via_textbee,
    "semaphore": _send_via_semaphore,
    "itexmo": _send_via_itexmo,
    "philsms": _send_via_philsms,
}


# ---------------------------------------------------------------------------
# Public SMSService class
# ---------------------------------------------------------------------------


class SMSService:
    """
    Provider-agnostic async SMS service.

    The active provider is selected by the ``SMS_PROVIDER`` setting (default:
    ``"semaphore"``).  All other code in the project calls only
    ``SMSService().send_sms(number, message)`` — the provider choice is
    entirely internal.

    Switching providers requires only a change to ``SMS_PROVIDER`` in .env
    and the corresponding API-key variable(s).  No Celery tasks, auth_service,
    or API endpoints need to change.

    To switch to textbee (recommended — no LOA, works immediately with any PH SIM):
        SMS_PROVIDER=textbee
        TEXTBEE_API_KEY=<your key from textbee.dev dashboard>
        TEXTBEE_DEVICE_ID=<device ID>  ← optional; leave blank for auto-select

    Quick fix for the "BHCMarilao rejected" problem without switching provider:
        SEMAPHORE_SENDER_NAME=Semaphore   ← platform default, no LOA needed

    To switch to iTExmo (no LOA, works immediately):
        SMS_PROVIDER=itexmo
        ITEXMO_API_KEY=<your key>
        ITEXMO_EMAIL=<your account email>

    To switch to PhilSMS (no LOA, free tier):
        SMS_PROVIDER=philsms
        PHILSMS_TOKEN=<bearer token>
        PHILSMS_SENDER_ID=PhilSMS
    """

    _REQUEST_TIMEOUT_SECONDS: float = _REQUEST_TIMEOUT_SECONDS

    async def send_sms(self, mobile_number: str, message: str) -> dict:  # type: ignore[type-arg]
        """
        Dispatch an SMS via the configured provider.

        The ``mobile_number`` should be in E.164 or local Philippine format
        (``+639171234567`` or ``09171234567``).

        Args:
            mobile_number: Recipient mobile number.
            message:       Plain-text SMS body (max 160 chars per segment;
                           providers handle concatenation for longer messages).

        Returns:
            A dict with at minimum ``{"message_id": str, "status": str}``.

        Raises:
            SMSTransientError: Network failure, timeout, or provider 5xx.
                               Celery will retry automatically.
            SMSPermanentError: Invalid number, bad API key, or provider 4xx.
                               Celery will NOT retry.
        """
        provider_name: str = settings.SMS_PROVIDER.lower().strip()

        dispatch_fn = _PROVIDER_DISPATCH.get(provider_name)
        if dispatch_fn is None:
            known = ", ".join(_PROVIDER_DISPATCH.keys())
            raise SMSPermanentError(
                f"Unknown SMS_PROVIDER '{provider_name}'. "
                f"Valid values: {known}. "
                "Fix SMS_PROVIDER in .env and restart the server. "
                "Recommended: SMS_PROVIDER=textbee (no LOA, works with any PH SIM).",
                status_code=0,
                body="",
            )

        from collections.abc import Awaitable
        import inspect

        # All dispatch functions are async — call them directly.
        result = dispatch_fn(mobile_number, message)  # type: ignore[operator]
        if inspect.isawaitable(result):
            return await result  # type: ignore[return-value]
        return result  # type: ignore[return-value]

    # -----------------------------------------------------------------------
    # SMS message template builders (unchanged)
    # -----------------------------------------------------------------------

    @staticmethod
    def build_appointment_reminder(
        patient_name: str,
        appointment_type: str,
        scheduled_at: datetime,
    ) -> str:
        """
        Build the English appointment reminder SMS body.

        Template (from SDP Section 9 / SMS_TEMPLATES registry):
          "Hi {patient_name}, this is a reminder for your {appointment_type}
          appointment at the Barangay Health Center on {scheduled_date} at
          {scheduled_time}. Please arrive 15 minutes early. Reply STOP to
          unsubscribe."

        Args:
            patient_name:     Patient's full name.
            appointment_type: Human-readable appointment type string
                              (e.g. "prenatal", "general checkup").
            scheduled_at:     Timezone-aware datetime of the appointment.

        Returns:
            Formatted SMS string (plain text, may exceed 160 chars — the
            active provider handles segmentation automatically).
        """
        scheduled_date = scheduled_at.strftime("%m/%d/%Y")
        scheduled_time = scheduled_at.strftime("%I:%M %p")

        return (
            f"Hi {patient_name}, this is a reminder for your "
            f"{appointment_type} appointment at the Barangay Health Center "
            f"on {scheduled_date} at {scheduled_time}. "
            f"Please arrive 15 minutes early. Reply STOP to unsubscribe."
        )

    # -----------------------------------------------------------------------
    # Synchronous wrapper (for use in Celery on_failure callbacks)
    # -----------------------------------------------------------------------

    @staticmethod
    def build_immunization_reminder(
        patient_name: str,
        vaccine_name: str,
        due_date: date,
    ) -> str:
        """
        Build the English immunization reminder SMS body.

        Template (from SDP Section 9 / SMS_TEMPLATES registry):
          "Hi {patient_name}, your {vaccine_name} immunization is due on
          {due_date} at the Barangay Health Center. Please bring your health
          card. Reply STOP to unsubscribe."

        Args:
            patient_name: Patient's full name.
            vaccine_name: Name of the vaccine (e.g. "BCG", "Hepatitis B Dose 1").
            due_date:     Date object for the next due date.

        Returns:
            Formatted SMS string.
        """
        due_date_str = due_date.strftime("%m/%d/%Y")
        return (
            f"Hi {patient_name}, your {vaccine_name} immunization is due on "
            f"{due_date_str} at the Barangay Health Center. "
            f"Please bring your health card. Reply STOP to unsubscribe."
        )


# ---------------------------------------------------------------------------
# Module-level sync wrapper (Celery on_failure / synchronous contexts)
# ---------------------------------------------------------------------------


def send_sms_sync(phone: str, message: str) -> None:
    """
    Synchronous wrapper around ``SMSService.send_sms()``.

    Used exclusively by Celery ``on_failure`` callbacks which run in a plain
    synchronous context (no existing event loop).  ``asyncio.run()`` creates a
    fresh event loop, dispatches the SMS, and tears the loop down.

    Failures are logged as ERROR but never re-raised so that an alert SMS
    failure cannot mask the original task failure that triggered the callback.

    Args:
        phone:   Destination phone number in E.164 format (+639171234567).
        message: SMS body text to deliver (keep under 160 chars to avoid
                 provider-side concatenation fees).
    """
    import asyncio
    import logging as _logging

    _log = _logging.getLogger(__name__)
    try:
        svc = SMSService()
        asyncio.run(svc.send_sms(mobile_number=phone, message=message))
    except Exception as exc:  # noqa: BLE001
        _log.error(
            "send_sms_sync failed — admin alert may not have been delivered: %s",
            exc,
            exc_info=True,
        )
