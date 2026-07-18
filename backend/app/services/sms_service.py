"""
Semaphore SMS service — async wrapper for the Semaphore v4 API.

Phase 1 note: ``auth_service.py`` stubs SMS with a logger call during
development.  This module exists so Phase 4 (Appointments & SMS) can import
and use ``SMSService`` without structural changes to the service layer.

Usage (Phase 4+)::

    from app.services.sms_service import SMSService

    sms = SMSService()
    await sms.send_sms("+639171234567", "Your appointment is tomorrow at 9 AM.")

Raises:
    SMSSendError: When Semaphore returns a non-2xx HTTP response or the
                  request times out.  Callers should catch this and decide
                  whether to retry (via Celery) or log the failure without
                  blocking the clinical workflow.
"""

from __future__ import annotations

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Exception
# ---------------------------------------------------------------------------


class SMSSendError(Exception):
    """
    Raised when the Semaphore API returns a non-2xx status or the request
    times out.

    Attributes:
        status_code: HTTP status code from Semaphore, or 0 on network/timeout error.
        body:        Raw response text from Semaphore (may contain error details).
    """

    def __init__(self, message: str, *, status_code: int = 0, body: str = "") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body

    def __repr__(self) -> str:
        return (
            f"SMSSendError({self.args[0]!r}, "
            f"status_code={self.status_code}, body={self.body!r})"
        )


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
        - ``SEMAPHORE_API_KEY``   — API key issued by Semaphore.
        - ``SEMAPHORE_SENDER_NAME`` — alphanumeric sender name (e.g. "BHC-Health").
        - ``SEMAPHORE_BASE_URL``  — API base (default: https://api.semaphore.co/api/v4).
    """

    _REQUEST_TIMEOUT_SECONDS: float = 10.0

    async def send_sms(self, mobile_number: str, message: str) -> dict:  # type: ignore[type-arg]
        """
        Dispatch an SMS via Semaphore.

        The ``mobile_number`` should be in E.164 format (e.g. ``+639171234567``
        or ``09171234567`` — Semaphore accepts both).

        Args:
            mobile_number: Recipient mobile number.
            message:       Plain-text SMS body (max 160 chars per segment).

        Returns:
            The parsed JSON response dict from Semaphore on success.

        Raises:
            SMSSendError: On non-2xx Semaphore response or request timeout.
        """
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
            async with httpx.AsyncClient(
                timeout=self._REQUEST_TIMEOUT_SECONDS
            ) as client:
                resp = await client.post(
                    f"{settings.SEMAPHORE_BASE_URL}/messages",
                    data=payload,
                )
        except httpx.TimeoutException as exc:
            logger.error(
                "Semaphore SMS request timed out",
                extra={"mobile_number": mobile_number},
            )
            raise SMSSendError(
                f"SMS request timed out after {self._REQUEST_TIMEOUT_SECONDS}s",
                status_code=0,
                body="",
            ) from exc
        except httpx.RequestError as exc:
            logger.error(
                "Semaphore SMS network error",
                extra={"mobile_number": mobile_number, "error": str(exc)},
            )
            raise SMSSendError(
                f"SMS network error: {exc}",
                status_code=0,
                body="",
            ) from exc

        if resp.is_error:
            logger.error(
                "Semaphore SMS API returned error status",
                extra={
                    "mobile_number": mobile_number,
                    "status_code": resp.status_code,
                    "body": resp.text[:500],  # truncate to avoid flooding logs
                },
            )
            raise SMSSendError(
                f"Semaphore API error (HTTP {resp.status_code})",
                status_code=resp.status_code,
                body=resp.text,
            )

        result: dict = resp.json()  # type: ignore[type-arg]
        logger.info(
            "SMS dispatched successfully",
            extra={"mobile_number": mobile_number, "response": result},
        )
        return result
