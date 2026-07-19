"""
Semaphore SMS service — async wrapper for the Semaphore v4 API.

Public API
----------
SMSTransientError  — Retriable error (network failure, 5xx from Semaphore).
SMSPermanentError  — Non-retriable error (invalid number, 4xx from Semaphore).
SMSService         — Async HTTP wrapper with template builders.

Usage::

    from app.services.sms_service import SMSService

    sms = SMSService()
    result = await sms.send_sms("+639171234567", "Your appointment is tomorrow at 9 AM.")
    # result = {"message_id": "...", "status": "queued"}

Dev mode (SEMAPHORE_API_KEY is empty string):
    A warning is logged and a simulated success response is returned so that
    local development works without a live Semaphore account.  The simulated
    message_id is a UUID prefixed with "sim-".
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Exception hierarchy
# ---------------------------------------------------------------------------


class SMSTransientError(Exception):
    """
    Raised when the Semaphore API is temporarily unavailable — network
    errors, request timeouts, or HTTP 5xx responses.

    Celery tasks that catch this should re-raise so autoretry fires with
    exponential backoff.

    Attributes:
        status_code: HTTP status code from Semaphore, or 0 for network/timeout.
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
    Raised when the Semaphore API rejects the request with a client error —
    invalid API key, invalid mobile number, blocked number, or 4xx response.

    Celery tasks that catch this should NOT retry; mark the sms_log as
    'failed' and move on.

    Attributes:
        status_code: HTTP status code from Semaphore.
        body:        Raw response text from Semaphore.
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
# Service class
# ---------------------------------------------------------------------------


class SMSService:
    """
    Thin async wrapper around the Semaphore v4 REST API.

    A single ``SMSService`` instance can be shared across the application.
    It creates a new ``httpx.AsyncClient`` on each ``send_sms`` call rather
    than reusing a persistent connection pool — acceptable for low-volume BHC
    use; upgrade to a shared client if throughput becomes a concern.

    Configuration is read from ``app.core.config.settings``:
        - ``SEMAPHORE_API_KEY``     — API key issued by Semaphore.
        - ``SEMAPHORE_SENDER_NAME`` — Alphanumeric sender name (e.g. "BHC-Health").
        - ``SEMAPHORE_BASE_URL``    — API base URL.

    Dev mode:
        When ``SEMAPHORE_API_KEY`` is an empty string (the default in .env.example),
        ``send_sms`` logs a warning and returns a simulated success response.
        This allows local development and tests to run without a live account.
    """

    _REQUEST_TIMEOUT_SECONDS: float = 10.0

    async def send_sms(self, mobile_number: str, message: str) -> dict:  # type: ignore[type-arg]
        """
        Dispatch an SMS via Semaphore.

        The ``mobile_number`` should be in E.164 or local Philippine format
        (``+639171234567`` or ``09171234567`` — Semaphore accepts both).

        Args:
            mobile_number: Recipient mobile number.
            message:       Plain-text SMS body (max 160 chars per segment;
                           Semaphore handles concatenation for longer messages).

        Returns:
            A dict with at minimum ``{"message_id": str, "status": str}``.
            Sourced from the Semaphore JSON response, or a simulated value in
            dev mode.

        Raises:
            SMSTransientError: Network failure, timeout, or Semaphore 5xx.
                               Celery will retry automatically.
            SMSPermanentError: Invalid number, bad API key, or Semaphore 4xx.
                               Celery will NOT retry.
        """
        # -------------------------------------------------------------------
        # Dev mode — no live API key configured
        # -------------------------------------------------------------------
        if not settings.SEMAPHORE_API_KEY:
            sim_id = f"sim-{uuid.uuid4().hex[:12]}"
            logger.warning(
                "SEMAPHORE_API_KEY is not set — simulating SMS send (dev mode)",
                extra={
                    "mobile_number": mobile_number,
                    "message_length": len(message),
                    "simulated_message_id": sim_id,
                },
            )
            return {"message_id": sim_id, "status": "queued"}

        # -------------------------------------------------------------------
        # Live Semaphore call
        # -------------------------------------------------------------------
        payload = {
            "apikey": settings.SEMAPHORE_API_KEY,
            "number": mobile_number,
            "message": message,
            "sendername": settings.SEMAPHORE_SENDER_NAME,
        }

        logger.info(
            "Sending SMS via Semaphore",
            extra={
                "mobile_number": mobile_number,
                "message_length": len(message),
                "sender_name": settings.SEMAPHORE_SENDER_NAME,
            },
        )

        try:
            async with httpx.AsyncClient(timeout=self._REQUEST_TIMEOUT_SECONDS) as client:
                resp = await client.post(
                    f"{settings.SEMAPHORE_BASE_URL}/messages",
                    data=payload,
                )
        except httpx.TimeoutException as exc:
            logger.error(
                "Semaphore SMS request timed out",
                extra={"mobile_number": mobile_number},
            )
            raise SMSTransientError(
                f"SMS request timed out after {self._REQUEST_TIMEOUT_SECONDS}s",
                status_code=0,
                body="",
            ) from exc
        except httpx.RequestError as exc:
            logger.error(
                "Semaphore SMS network error",
                extra={"mobile_number": mobile_number, "error": str(exc)},
            )
            raise SMSTransientError(
                f"SMS network error: {exc}",
                status_code=0,
                body="",
            ) from exc

        # Semaphore returns a list when successful, e.g.:
        #   [{"message_id": 12345, "user_id": 6, "user": "BHC", "account_id": 1, ...}]
        if resp.is_error:
            logger.error(
                "Semaphore SMS API returned error status",
                extra={
                    "mobile_number": mobile_number,
                    "status_code": resp.status_code,
                    "body": resp.text[:500],
                },
            )
            if resp.status_code >= 500:
                raise SMSTransientError(
                    f"Semaphore server error (HTTP {resp.status_code})",
                    status_code=resp.status_code,
                    body=resp.text,
                )
            # 4xx — permanent: invalid key, invalid number, etc.
            raise SMSPermanentError(
                f"Semaphore client error (HTTP {resp.status_code})",
                status_code=resp.status_code,
                body=resp.text,
            )

        raw: list | dict = resp.json()

        # Normalise the response to {"message_id": str, "status": str}.
        # Semaphore v4 returns a list of message objects for batch sends.
        if isinstance(raw, list) and raw:
            first = raw[0]
            # Semaphore message_id may be an int — cast to string for uniform storage.
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

    # -----------------------------------------------------------------------
    # SMS message template builders
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
            Formatted SMS string (plain text, may exceed 160 chars — Semaphore
            will segment automatically).
        """
        # Use Philippine date/time format (MM/DD/YYYY, 12-hour clock with AM/PM).
        scheduled_date = scheduled_at.strftime("%m/%d/%Y")
        scheduled_time = scheduled_at.strftime("%I:%M %p")

        return (
            f"Hi {patient_name}, this is a reminder for your "
            f"{appointment_type} appointment at the Barangay Health Center "
            f"on {scheduled_date} at {scheduled_time}. "
            f"Please arrive 15 minutes early. Reply STOP to unsubscribe."
        )

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
