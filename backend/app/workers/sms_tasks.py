"""
Celery SMS tasks — dispatched when appointments are scheduled or reminders are due.

Task:
  send_reminder_task(sms_log_id: str) -> dict
    Loads the sms_logs row by primary key, calls SMSService.send_sms(),
    updates status on success or failure, and retries on transient errors.

Security note:
  Task arguments contain ONLY the sms_log_id (a UUID string).  The task
  loads the mobile number and message body from the database at execution
  time.  No PHI is placed in Celery task arguments, queue payloads, or
  result-backend storage.

Celery tasks are synchronous — async service functions are called via
``asyncio.run()`` inside a helper that creates its own event loop.  This
is safe because Celery workers are separate processes from the FastAPI ASGI
server; there is no existing event loop in the Celery worker process.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from celery import Task

from app.core.config import settings
from app.core.logging import get_logger
from app.services.sms_service import SMSPermanentError, SMSService, SMSTransientError
from app.workers.celery_app import celery_app

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Sync DB helper — used inside Celery (sync) context
# ---------------------------------------------------------------------------


def _run_async(coro: Any) -> Any:  # type: ignore[misc]
    """
    Run a coroutine synchronously inside a Celery task.

    Celery workers run in plain synchronous Python processes with no
    pre-existing event loop.  ``asyncio.run()`` creates a new event loop,
    runs the coroutine to completion, and tears it down.  This is the
    recommended approach for bridging async service functions into Celery
    tasks without third-party libraries like ``asgiref``.
    """
    return asyncio.run(coro)


async def _load_sms_log_and_send(sms_log_id: str) -> dict:  # type: ignore[type-arg]
    """
    Async body of the send_reminder_task.

    1. Open a fresh async DB session (independent of any FastAPI request session).
    2. Load the sms_logs row by id.
    3. Call SMSService.send_sms().
    4. Update the row: status='sent', provider_message_id, sent_at.
    5. Commit and return a result dict.

    Raises:
        SMSTransientError: Propagated so autoretry fires.
        SMSPermanentError: Caught — row marked 'failed', not re-raised.
    """
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.models.sms_log import SmsLog
    from app.workers.db import CelerySessionLocal

    sms_log_uuid = uuid.UUID(sms_log_id)

    async with CelerySessionLocal() as db:
        # Load the sms_log row.
        result = await db.execute(select(SmsLog).where(SmsLog.id == sms_log_uuid))
        sms_log: SmsLog | None = result.scalar_one_or_none()

        if sms_log is None:
            logger.error(
                "send_reminder_task: sms_log row not found",
                extra={"sms_log_id": sms_log_id},
            )
            return {"sms_log_id": sms_log_id, "status": "error", "reason": "not_found"}

        # Avoid re-sending if already dispatched (idempotency guard).
        if sms_log.status in ("sent", "delivered"):
            logger.info(
                "send_reminder_task: SMS already dispatched, skipping",
                extra={"sms_log_id": sms_log_id, "current_status": sms_log.status},
            )
            return {"sms_log_id": sms_log_id, "status": sms_log.status}

        sms_svc = SMSService()
        try:
            api_result = await sms_svc.send_sms(
                mobile_number=sms_log.mobile_number,
                message=sms_log.message,
            )
            sms_log.status = "sent"
            sms_log.provider_message_id = api_result.get("message_id", "")
            sms_log.sent_at = datetime.now(tz=UTC)
            await db.commit()
            logger.info(
                "send_reminder_task: SMS sent successfully",
                extra={
                    "sms_log_id": sms_log_id,
                    "provider_message_id": sms_log.provider_message_id,
                },
            )
            return {
                "sms_log_id": sms_log_id,
                "status": "sent",
                "provider_message_id": sms_log.provider_message_id,
            }

        except SMSPermanentError as exc:
            # Permanent failure — do NOT retry.
            sms_log.status = "failed"
            sms_log.error_detail = f"{exc} (HTTP {exc.status_code}): {exc.body[:300]}"
            await db.commit()
            logger.error(
                "send_reminder_task: permanent SMS failure — no retry",
                extra={
                    "sms_log_id": sms_log_id,
                    "status_code": exc.status_code,
                    "body": exc.body[:200],
                },
            )
            # Return normally — Celery will not retry.
            return {
                "sms_log_id": sms_log_id,
                "status": "failed",
                "reason": "permanent_error",
            }

        except SMSTransientError:
            # Temporarily mark failed so monitoring can see the attempt.
            # Will be updated to 'sent' when the autoretry succeeds.
            sms_log.status = "failed"
            await db.commit()
            # Re-raise so Celery autoretry mechanism fires.
            raise


class SendSmsTask(Task):
    def on_failure(
        self,
        exc: Exception,
        task_id: str,
        args: list,  # type: ignore[type-arg]
        kwargs: dict,  # type: ignore[type-arg]
        einfo: object,
    ) -> None:
        _on_send_sms_task_failure(self, exc, task_id, args, kwargs, einfo)


@celery_app.task(
    base=SendSmsTask,
    bind=True,
    autoretry_for=(SMSTransientError,),
    retry_backoff=True,  # exponential backoff: 2s, 4s, 8s, …
    retry_backoff_max=600,  # cap at 10 minutes between retries
    retry_jitter=True,  # randomise backoff to avoid thundering herd
    max_retries=settings.SMS_MAX_RETRIES,
    name="sms.send_sms",
    acks_late=True,
)
def send_sms_task(self: Task, mobile_number: str, message: str) -> dict:  # type: ignore[type-arg]
    """
    Celery task: send an SMS directly to a mobile number with a given message.

    Unlike ``send_reminder_task``, this task takes the mobile number and message
    body directly in its arguments.  It is used for transactional messages where
    no ``sms_logs`` row needs to be pre-created (e.g. welcome SMS with a
    temporary password sent immediately after account creation).

    Retry behaviour:
      - SMSTransientError (network, timeout, 5xx) — retries with exponential
        backoff up to SMS_MAX_RETRIES (default 3).
      - SMSPermanentError (invalid number, 4xx) — no retry; failure is logged.

    Security note:
      The message body travels through the Celery queue.  Callers must ensure
      that no patient PHI (diagnoses, medical history) is included.  Temporary
      passwords are acceptable because they are short-lived and delivered only
      to the account holder's own registered mobile number.

    Args:
        mobile_number: Destination phone number in E.164 format (+639171234567).
        message:       SMS body text to deliver.

    Returns:
        Dict with keys: mobile_number, status, and optionally provider_message_id.
    """
    logger.info(
        "send_sms_task started",
        extra={
            "mobile_number": mobile_number,
            "attempt": self.request.retries + 1,
            "max_retries": self.max_retries,
        },
    )

    async def _send() -> dict:  # type: ignore[type-arg]

        sms_svc = SMSService()
        try:
            api_result = await sms_svc.send_sms(
                mobile_number=mobile_number,
                message=message,
            )
            provider_message_id = api_result.get("message_id", "")
            logger.info(
                "send_sms_task: SMS sent successfully",
                extra={
                    "mobile_number": mobile_number,
                    "provider_message_id": provider_message_id,
                },
            )
            return {
                "mobile_number": mobile_number,
                "status": "sent",
                "provider_message_id": provider_message_id,
            }
        except SMSPermanentError as exc:
            logger.error(
                "send_sms_task: permanent SMS failure — no retry",
                extra={
                    "mobile_number": mobile_number,
                    "status_code": exc.status_code,
                    "body": exc.body[:200],
                },
            )
            return {
                "mobile_number": mobile_number,
                "status": "failed",
                "reason": "permanent_error",
            }
        # SMSTransientError is not caught here — it propagates so autoretry fires.

    return _run_async(_send())


def _on_send_sms_task_failure(
    self: Task,
    exc: Exception,
    task_id: str,
    args: list,  # type: ignore[type-arg]
    kwargs: dict,  # type: ignore[type-arg]
    einfo: object,
) -> None:
    """
    Called by Celery when ``send_sms_task`` has exhausted all retries.

    Actions:
    1. Increment ``sms:failed_tasks:count`` in Redis (TTL 24 h) so the hourly
       ``check_sms_failure_rate`` monitor can detect elevated failure rates.
    2. Send an admin alert SMS via ``send_sms_sync`` if ``ADMIN_ALERT_PHONE``
       is configured.  Alert failures are swallowed so they never mask the
       original failure.
    """
    import redis as redis_lib

    _log = logger

    # Increment Redis failure counter (TTL 24 h).
    try:
        r = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
        pipe = r.pipeline()
        pipe.incr("sms:failed_tasks:count")
        pipe.expire("sms:failed_tasks:count", 86400)  # 24 hours
        pipe.execute()
    except Exception as redis_exc:  # noqa: BLE001
        _log.warning(
            "send_sms_task on_failure: Redis counter update failed: %s",
            redis_exc,
        )

    # Send admin alert SMS.
    if settings.ADMIN_ALERT_PHONE:
        from app.services.sms_service import send_sms_sync

        mobile_number: str = args[0] if args else "unknown"
        send_sms_sync(
            phone=settings.ADMIN_ALERT_PHONE,
            message=(
                f"[SmartHealth Alert] send_sms_task failed permanently. "
                f"Task ID: {task_id}. Target: {mobile_number}. "
                f"Error: {type(exc).__name__}: {str(exc)[:80]}"
            ),
        )

    _log.error(
        "send_sms_task: all retries exhausted — permanent failure",
        extra={"task_id": task_id, "exc_type": type(exc).__name__, "exc": str(exc)},
    )


class SendReminderTask(Task):
    def on_failure(
        self,
        exc: Exception,
        task_id: str,
        args: list,  # type: ignore[type-arg]
        kwargs: dict,  # type: ignore[type-arg]
        einfo: object,
    ) -> None:
        _on_send_reminder_task_failure(self, exc, task_id, args, kwargs, einfo)


@celery_app.task(
    base=SendReminderTask,
    bind=True,
    autoretry_for=(SMSTransientError,),
    retry_backoff=True,  # exponential backoff: 2s, 4s, 8s, …
    retry_backoff_max=600,  # cap at 10 minutes between retries
    retry_jitter=True,  # randomise backoff to avoid thundering herd
    max_retries=settings.SMS_MAX_RETRIES,
    name="sms.send_reminder",
    # Ensure task ID is stable across retries so Flower shows one entry.
    acks_late=True,
)
def send_reminder_task(self: Task, sms_log_id: str) -> dict:  # type: ignore[type-arg]
    """
    Celery task: dispatch a queued SMS reminder via Semaphore.

    Receives only the ``sms_log_id`` (UUID string) — loads all PHI from DB
    at execution time so no patient data travels through the task queue.

    Retry behaviour:
      - SMSTransientError (network, timeout, 5xx) — retries with exponential
        backoff up to SMS_MAX_RETRIES (default 3).
      - SMSPermanentError (invalid number, 4xx) — no retry; row marked 'failed'.

    Args:
        sms_log_id: UUID string of the sms_logs row to process.

    Returns:
        Dict with keys: sms_log_id, status, and optionally provider_message_id.
    """
    logger.info(
        "send_reminder_task started",
        extra={
            "sms_log_id": sms_log_id,
            "attempt": self.request.retries + 1,
            "max_retries": self.max_retries,
        },
    )
    return _run_async(_load_sms_log_and_send(sms_log_id))


def _on_send_reminder_task_failure(
    self: Task,
    exc: Exception,
    task_id: str,
    args: list,  # type: ignore[type-arg]
    kwargs: dict,  # type: ignore[type-arg]
    einfo: object,
) -> None:
    """
    Called by Celery when ``send_reminder_task`` has exhausted all retries.

    Actions:
    1. Mark the ``sms_logs`` row status as ``'failed'`` in the database so the
       SMS log viewer shows the correct final state (the row may still show
       the transient ``'failed'`` state from the last retry attempt, but this
       ensures it is committed even if the task body raised before its own
       DB update could complete).
    2. Increment ``sms:failed_tasks:count`` in Redis (TTL 24 h) for the hourly
       ``check_sms_failure_rate`` monitoring task.
    3. Send an admin alert SMS via ``send_sms_sync`` if ``ADMIN_ALERT_PHONE``
       is configured.  Alert failures are swallowed so they never mask the
       original failure.
    """
    import redis as redis_lib

    _log = logger

    sms_log_id: str = args[0] if args else "unknown"

    # Increment Redis failure counter (TTL 24 h).
    try:
        r = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
        pipe = r.pipeline()
        pipe.incr("sms:failed_tasks:count")
        pipe.expire("sms:failed_tasks:count", 86400)  # 24 hours
        pipe.execute()
    except Exception as redis_exc:  # noqa: BLE001
        _log.warning(
            "send_reminder_task on_failure: Redis counter update failed: %s",
            redis_exc,
        )

    # Send admin alert SMS.
    if settings.ADMIN_ALERT_PHONE:
        from app.services.sms_service import send_sms_sync

        send_sms_sync(
            phone=settings.ADMIN_ALERT_PHONE,
            message=(
                f"[SmartHealth Alert] SMS reminder task failed permanently. "
                f"Task ID: {task_id}. SMS log: {sms_log_id}. "
                f"Error: {type(exc).__name__}: {str(exc)[:80]}"
            ),
        )

    _log.error(
        "send_reminder_task: all retries exhausted — permanent failure",
        extra={
            "task_id": task_id,
            "sms_log_id": sms_log_id,
            "exc_type": type(exc).__name__,
            "exc": str(exc),
        },
    )
