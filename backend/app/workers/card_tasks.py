"""
Celery tasks for batch health card generation.

Task:
  generate_card_task(patient_id: str, issued_by_id: str, batch_id: str)
    Calls CardGenerationService.generate_card() for one patient, then records
    the result (success / failed:<msg>) in a Redis hash keyed by batch_id.

Redis data structure
--------------------
  batch:{batch_id}:meta   — HASH
      total     → str(int)   total tasks in the batch
      issued_by → str(UUID)  user who triggered the batch

  batch:{batch_id}:results — HASH
      {patient_id} → "success"
                   | "failed:<truncated_error_message>"

Both keys have a TTL of 3600 seconds (1 hour).  They are created by the
batch-generate endpoint before tasks are enqueued; each task updates the
results hash as it completes.

Security note:
  Task arguments contain ONLY UUIDs — no PHI is placed in Celery task args.
  Redis values are short status strings — no PHI is stored in Redis.

Pattern mirrors health_card_tasks.py:
  - CelerySessionLocal for a fresh async session per task invocation.
  - asyncio.run() for the event-loop-per-task model required by Celery.
  - Late-ack (acks_late=True) so a worker crash re-queues the task.
  - Failure is swallowed after being recorded so the batch continues.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from app.core.logging import get_logger
from app.workers.celery_app import celery_app

logger = get_logger(__name__)


def _run_async(coro: Any) -> Any:  # type: ignore[misc]
    """Run a coroutine synchronously — standard Celery task wrapper."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Async implementation
# ---------------------------------------------------------------------------


async def _generate_card_task_async(
    patient_id: str,
    issued_by_id: str,
    batch_id: str,
) -> None:
    """
    Async implementation: generate one card and record the result in Redis.

    Steps:
    1. Call card_generation_service.generate_card() using a CelerySessionLocal
       DB session (async, one session per task invocation).
    2. On success: set Redis hash field patient_id = "success".
    3. On failure: set Redis hash field patient_id = "failed:<error[:100]>".
       Do NOT re-raise — the batch must continue for other patients.
    4. Refresh the Redis key TTL to 3600 s after each write.

    Uses a synchronous redis.from_url() client (not aioredis) because Celery
    tasks run inside asyncio.run(), but the Redis write is a tiny operation
    that does not justify the added complexity of an async client inside a
    task that is already blocking the Celery worker thread.
    """
    import redis as redis_lib  # noqa: PLC0415

    from app.core.config import settings  # noqa: PLC0415
    from app.services import card_generation_service  # noqa: PLC0415
    from app.workers.db import CelerySessionLocal  # noqa: PLC0415

    results_key = f"batch:{batch_id}:results"
    redis_client = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)

    try:
        patient_uuid = uuid.UUID(patient_id)
        issued_by_uuid = uuid.UUID(issued_by_id)

        async with CelerySessionLocal() as db:
            await card_generation_service.generate_card(
                db=db,
                patient_id=patient_uuid,
                issued_by_id=issued_by_uuid,
            )

        # Record success in the Redis hash.
        redis_client.hset(results_key, patient_id, "success")
        redis_client.expire(results_key, 3600)

        logger.info(
            "generate_card_task: card generated successfully",
            extra={"patient_id": patient_id, "batch_id": batch_id},
        )

    except Exception as exc:  # noqa: BLE001
        # Truncate error message to 100 chars to keep Redis values compact.
        error_msg = str(exc)[:100]
        failure_value = f"failed:{error_msg}"

        try:
            redis_client.hset(results_key, patient_id, failure_value)
            redis_client.expire(results_key, 3600)
        except Exception as redis_exc:  # noqa: BLE001
            logger.error(
                "generate_card_task: could not record failure in Redis",
                extra={
                    "patient_id": patient_id,
                    "batch_id": batch_id,
                    "redis_error": str(redis_exc),
                },
            )

        logger.error(
            "generate_card_task: card generation failed",
            extra={
                "patient_id": patient_id,
                "batch_id": batch_id,
                "error": str(exc),
            },
            exc_info=True,
        )
        # Do NOT re-raise — the batch must continue for other patients.


# ---------------------------------------------------------------------------
# Celery task wrapper
# ---------------------------------------------------------------------------


@celery_app.task(
    name="health_cards.generate_card_batch_item",
    bind=False,
    acks_late=True,
    task_reject_on_worker_lost=True,
    # No automatic retries: if generation fails, the result is recorded as
    # "failed" immediately so the batch status endpoint reflects it.  The
    # operator can re-trigger individual cards via the single-card generate
    # endpoint.  Retrying silently would delay batch completion and cause
    # confusing partial-results states.
    max_retries=0,
)
def generate_card_task(
    patient_id: str,
    issued_by_id: str,
    batch_id: str,
) -> None:
    """
    Celery task: generate one health card as part of a batch operation.

    Arguments contain ONLY UUIDs and a batch_id string — no PHI.
    Results are recorded in Redis hash batch:{batch_id}:results.

    This task intentionally does not re-raise on failure — the batch must
    continue processing other patients even when one card fails.
    """
    logger.info(
        "generate_card_task started",
        extra={
            "patient_id": patient_id,
            "issued_by_id": issued_by_id,
            "batch_id": batch_id,
        },
    )
    _run_async(
        _generate_card_task_async(patient_id, issued_by_id, batch_id)
    )
