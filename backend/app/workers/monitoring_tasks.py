"""
Celery monitoring tasks for SmartHealth Hub.

Tasks:
  check_sms_failure_rate — runs at :30 past every hour (Celery Beat).
    Reads the ``sms:failed_tasks:count`` Redis counter that is incremented by
    the ``send_reminder_task`` and ``send_sms_task`` on_failure callbacks.
    If the count meets or exceeds the threshold (default: 5 failures in 24 h),
    an admin alert SMS is dispatched via ``send_sms_sync`` and a WARNING is
    written to the Celery worker log.

The Redis key ``sms:failed_tasks:count`` has a 24-hour TTL that is refreshed
on every increment; it therefore represents a rolling 24-hour window of task
failures and resets automatically when no failures occur for 24 hours.

To register this task, ensure ``app.workers.monitoring_tasks`` is listed in
the ``include`` list inside ``app.workers.celery_app`` and that the
``check-sms-failure-rate`` entry exists in ``celery_app.conf.beat_schedule``.
"""

from __future__ import annotations

import logging

from app.core.config import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

_FAILURE_COUNT_KEY: str = "sms:failed_tasks:count"
_FAILURE_THRESHOLD: int = 5  # alert when this many failures accumulate in 24 h


@celery_app.task(name="monitoring.check_sms_failure_rate", bind=False)
def check_sms_failure_rate() -> dict[str, int]:
    """
    Hourly monitoring task (runs at :30 past every hour via Celery Beat).

    Reads the 24-hour SMS task failure counter from Redis and triggers an
    admin alert SMS when the count reaches or exceeds ``_FAILURE_THRESHOLD``
    (5 failures).

    Returns:
        Dict with ``{"failure_count": int, "threshold": int,
                     "alert_sent": bool}`` for Celery result storage.
    """
    import redis as redis_lib

    # Read the failure counter from Redis.
    try:
        r = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
        raw: str | None = r.get(_FAILURE_COUNT_KEY)
        count: int = int(raw) if raw else 0
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "check_sms_failure_rate: Redis read failed — skipping this run: %s",
            exc,
        )
        return {"failure_count": -1, "threshold": _FAILURE_THRESHOLD, "alert_sent": False}

    alert_sent: bool = False

    if count >= _FAILURE_THRESHOLD:
        logger.warning(
            "check_sms_failure_rate: SMS failure threshold reached — "
            "%d failures in the last 24 hours (threshold: %d)",
            count,
            _FAILURE_THRESHOLD,
        )

        if settings.ADMIN_ALERT_PHONE:
            from app.services.sms_service import send_sms_sync

            send_sms_sync(
                phone=settings.ADMIN_ALERT_PHONE,
                message=(
                    f"[SmartHealth Alert] {count} SMS reminder tasks failed "
                    f"in the last 24 hours. "
                    "Check Celery logs and the SMS provider dashboard."
                ),
            )
            alert_sent = True
        else:
            logger.warning(
                "check_sms_failure_rate: ADMIN_ALERT_PHONE is not configured — "
                "admin alert SMS not sent.  Set ADMIN_ALERT_PHONE in .env to "
                "receive SMS notifications on high failure rates."
            )
    else:
        logger.info(
            "check_sms_failure_rate: %d failures in last 24 h (threshold: %d) — OK",
            count,
            _FAILURE_THRESHOLD,
        )

    return {
        "failure_count": count,
        "threshold": _FAILURE_THRESHOLD,
        "alert_sent": alert_sent,
    }
