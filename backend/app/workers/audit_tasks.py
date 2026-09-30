"""
Celery Beat audit anomaly scanning task for SmartHealth Hub.

Task:
  scan_audit_anomalies — runs at :30 past every hour (offset from SMS
    monitoring task which also runs at :30 but is a different concern).
    Queries audit_logs for three anomaly patterns:
      - PHI_VIEW burst (>50 views in 60 min by same user)
      - After-hours DELETE on patient records (outside 08:00-18:00 PHT)
      - Login failure burst (>10 failures from same IP in 5 min)
    Logs every finding at WARNING level.
    Sends a summary SMS to ADMIN_ALERT_PHONE when anomalies are found
    (no-op if ADMIN_ALERT_PHONE is not configured).

All exceptions are caught and logged — this task must never raise; a crash
would suppress subsequent Beat executions for the same schedule slot.

Registration:
  ``app.workers.audit_tasks`` is listed in celery_app.include and the
  ``audit-scan-anomalies`` entry is added to celery_app.conf.beat_schedule.
"""

from __future__ import annotations

import asyncio
import logging

from app.core.config import settings
from app.services.audit_anomaly_service import (
    AnomalyEvent,
    check_after_hours_deletes,
    check_login_failure_burst,
    check_phi_view_burst,
)
from app.services.sms_service import send_sms_sync
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="audit.scan_anomalies", bind=False)
def scan_audit_anomalies() -> dict[str, int]:
    """
    Hourly audit anomaly scan — detect suspicious patterns and alert Admin.

    Wraps async DB logic in ``asyncio.run()`` so the synchronous Celery
    worker thread can await SQLAlchemy async queries without an existing
    event loop.  Uses ``CelerySessionLocal`` (NullPool engine) to avoid
    cross-loop connection reuse issues.

    Returns:
        Dict with ``{"anomalies_found": int, "alert_sent": bool}`` for
        Celery result storage and Flower inspection.
    """

    async def _run() -> list[AnomalyEvent]:
        """Run all anomaly checks inside a single DB session."""
        from app.workers.db import CelerySessionLocal

        anomalies: list[AnomalyEvent] = []
        try:
            async with CelerySessionLocal() as db:
                anomalies += await check_phi_view_burst(db)
                anomalies += await check_after_hours_deletes(db)
                anomalies += await check_login_failure_burst(db)
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "audit.scan_anomalies: DB query failed — skipping this run: %s",
                exc,
                exc_info=True,
            )
        return anomalies

    try:
        anomalies = asyncio.run(_run())
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "audit.scan_anomalies: asyncio.run failed unexpectedly: %s",
            exc,
            exc_info=True,
        )
        return {"anomalies_found": -1, "alert_sent": False}

    if not anomalies:
        logger.info("audit.scan_anomalies: no anomalies detected")
        return {"anomalies_found": 0, "alert_sent": False}

    # Log every finding individually so they appear in Celery worker logs
    # and any log aggregation pipeline (ELK, Loki, etc.).
    for event in anomalies:
        logger.warning(
            "AUDIT ANOMALY [%s][%s]: %s",
            event.severity,
            event.check_name,
            event.detail,
        )

    alert_sent: bool = False

    if settings.ADMIN_ALERT_PHONE:
        # Build a compact summary: show up to 3 findings inline; suffix with
        # "+N more" when there are additional findings.
        summary_parts = [
            f"{e.check_name}: {e.detail[:60]}" for e in anomalies[:3]
        ]
        summary = "; ".join(summary_parts)
        if len(anomalies) > 3:
            summary += f" (+{len(anomalies) - 3} more)"

        plural = "y" if len(anomalies) == 1 else "ies"
        message = (
            f"[SmartHealth Alert] {len(anomalies)} audit anomal{plural} "
            f"detected: {summary}"
        )

        try:
            send_sms_sync(phone=settings.ADMIN_ALERT_PHONE, message=message)
            alert_sent = True
            logger.info(
                "audit.scan_anomalies: admin alert SMS sent for %d anomal%s",
                len(anomalies),
                plural,
            )
        except Exception as sms_exc:  # noqa: BLE001
            # SMS failure must never mask the anomaly findings — they are
            # already in the log.  Just record the delivery failure.
            logger.error(
                "audit.scan_anomalies: failed to send admin alert SMS: %s",
                sms_exc,
                exc_info=True,
            )
    else:
        logger.warning(
            "audit.scan_anomalies: %d anomal%s detected but ADMIN_ALERT_PHONE "
            "is not configured — no SMS alert sent.  Set ADMIN_ALERT_PHONE "
            "in .env to receive notifications.",
            len(anomalies),
            plural,
        )

    return {"anomalies_found": len(anomalies), "alert_sent": alert_sent}
