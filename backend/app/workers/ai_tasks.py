"""
AI analytics Celery tasks.

Tasks:
  run_risk_scoring_task     — nightly 01:00 Asia/Manila
    Scores all upcoming appointments (next 7 days) using ai_service.
    Upserts into ai_risk_scores (unique on appointment_id).
    Deletes scores where expires_at < now().
    Returns {"scored": int, "skipped": int, "errors": int}

  run_anomaly_detection_task — nightly 01:30 Asia/Manila
    Detects illness trend anomalies using risk_scoring_service.
    Deactivates previous week's alerts (is_active=False).
    Inserts new active alerts for current week.
    Returns {"alerts_created": int, "alerts_cleared": int}

Security: No PHI passes through these tasks. All data sent to OpenAI
is extracted in risk_scoring_service and is aggregate/non-identifying.
Task arguments are empty (no UUIDs or PHI in Celery task payloads).
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy.engine import CursorResult

from app.core.logging import get_logger
from app.workers.celery_app import celery_app

logger = get_logger(__name__)


def _now_utc() -> datetime:
    return datetime.now(tz=UTC)


# ---------------------------------------------------------------------------
# Risk scoring task
# ---------------------------------------------------------------------------


async def _run_risk_scoring_async() -> dict:  # type: ignore[type-arg]
    from sqlalchemy import delete, select

    from app.models.ai_risk_score import AiRiskScore
    from app.services import ai_service, risk_scoring_service
    from app.workers.db import CelerySessionLocal

    scored = 0
    skipped = 0
    errors = 0

    async with CelerySessionLocal() as db:
        # Step 1: Delete expired scores (expires_at < now)
        now = _now_utc()
        delete_stmt = delete(AiRiskScore).where(
            AiRiskScore.expires_at < now,
            AiRiskScore.expires_at.isnot(None),
        )
        deleted_result = await db.execute(delete_stmt)
        await db.commit()
        logger.info(
            "Expired risk scores deleted",
            extra={"count": cast(CursorResult[tuple[()]], deleted_result).rowcount},
        )

        # Step 2: Get upcoming appointments with features
        feature_rows = await risk_scoring_service.get_upcoming_appointments_for_scoring(
            db, horizon_days=7
        )

        # Step 3: Score each appointment
        for row in feature_rows:
            appointment_id: uuid.UUID = row["appointment_id"]

            # Check if a non-expired score already exists for this appointment
            existing_stmt = select(AiRiskScore.id).where(
                AiRiskScore.appointment_id == appointment_id
            )
            existing_result = await db.execute(existing_stmt)
            if existing_result.scalar_one_or_none() is not None:
                skipped += 1
                continue

            try:
                ai_result = await ai_service.score_appointment_risk(
                    patient_code=row["patient_code"],
                    historical_no_show_rate=row["historical_no_show_rate"],
                    lead_time_days=row["lead_time_days"],
                    day_of_week=row["day_of_week"],
                    appointment_type=row["appointment_type"],
                    is_senior=row["is_senior"],
                    is_pwd=row["is_pwd"],
                    is_pregnant=row["is_pregnant"],
                    visit_frequency_90d=row["visit_frequency_90d"],
                )

                features_snapshot = {
                    "historical_no_show_rate": row["historical_no_show_rate"],
                    "lead_time_days": row["lead_time_days"],
                    "day_of_week": row["day_of_week"],
                    "appointment_type": row["appointment_type"],
                    "is_senior": row["is_senior"],
                    "is_pwd": row["is_pwd"],
                    "is_pregnant": row["is_pregnant"],
                    "visit_frequency_90d": row["visit_frequency_90d"],
                    "ai_generated": ai_result.get("ai_generated", False),
                }

                score_row = AiRiskScore(
                    id=uuid.uuid4(),
                    appointment_id=appointment_id,
                    patient_id=row["patient_id"],
                    patient_code=row["patient_code"],
                    risk_level=ai_result["risk_level"],
                    risk_score=ai_result["risk_score"],
                    recommendation=ai_result["recommendation"],
                    reasoning=ai_result["reasoning"],
                    features_json=features_snapshot,
                    computed_at=_now_utc(),
                    expires_at=row["scheduled_at"],
                )
                db.add(score_row)
                await db.commit()
                scored += 1
                logger.info(
                    "Appointment scored",
                    extra={
                        "appointment_id": str(appointment_id),
                        "risk_level": ai_result["risk_level"],
                    },
                )
            except Exception as exc:  # noqa: BLE001
                await db.rollback()
                errors += 1
                logger.warning(
                    "Failed to score appointment",
                    extra={"appointment_id": str(appointment_id), "error": str(exc)},
                )

    return {"scored": scored, "skipped": skipped, "errors": errors}


@celery_app.task(name="ai_tasks.run_risk_scoring", bind=True, max_retries=2)
def run_risk_scoring_task(self: Any) -> dict:  # type: ignore[misc]
    """
    Nightly Celery Beat task (01:00 Asia/Manila).
    Scores upcoming appointments and writes results to ai_risk_scores.
    """
    logger.info("run_risk_scoring_task: starting")
    try:
        result = asyncio.run(_run_risk_scoring_async())
        logger.info("run_risk_scoring_task: completed", extra=result)
        return result
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "run_risk_scoring_task: fatal error",
            extra={"error": str(exc)},
        )
        raise self.retry(exc=exc, countdown=300)


# ---------------------------------------------------------------------------
# Anomaly detection task
# ---------------------------------------------------------------------------


async def _run_anomaly_detection_async() -> dict:  # type: ignore[type-arg]
    from sqlalchemy import update

    from app.models.ai_anomaly_alert import AiAnomalyAlert
    from app.services import ai_service, risk_scoring_service
    from app.workers.db import CelerySessionLocal

    alerts_created = 0
    alerts_cleared = 0

    async with CelerySessionLocal() as db:
        # Step 1: Deactivate all currently active alerts from previous weeks
        now = _now_utc()
        current_week_label = now.strftime("%G-W%V")

        clear_stmt = (
            update(AiAnomalyAlert)
            .where(
                AiAnomalyAlert.is_active.is_(True),
                AiAnomalyAlert.week_label != current_week_label,
            )
            .values(is_active=False)
        )
        cleared_result = await db.execute(clear_stmt)
        await db.commit()
        alerts_cleared = cast(CursorResult[tuple[()]], cleared_result).rowcount
        logger.info(
            "Previous anomaly alerts deactivated",
            extra={"count": alerts_cleared},
        )

        # Step 2: Run statistical anomaly detection
        anomalies = await risk_scoring_service.run_illness_anomaly_detection(db, lookback_weeks=8)

        # Step 3: For each anomaly, generate AI alert and insert if not exists
        for anomaly in anomalies:
            # Idempotency: skip if alert for this condition+week already active
            from sqlalchemy import select

            existing_stmt = select(AiAnomalyAlert.id).where(
                AiAnomalyAlert.condition_name == anomaly["condition_name"],
                AiAnomalyAlert.week_label == anomaly["week_label"],
                AiAnomalyAlert.is_active.is_(True),
            )
            existing_result = await db.execute(existing_stmt)
            if existing_result.scalar_one_or_none() is not None:
                continue

            try:
                ai_result = await ai_service.generate_anomaly_alert(
                    condition_name=anomaly["condition_name"],
                    current_count=anomaly["current_count"],
                    baseline_mean=anomaly["baseline_mean"],
                    baseline_stdev=anomaly["baseline_stdev"],
                    z_score=anomaly["z_score"],
                    week_label=anomaly["week_label"],
                )

                alert_row = AiAnomalyAlert(
                    id=uuid.uuid4(),
                    condition_name=anomaly["condition_name"],
                    severity=ai_result["severity"],
                    z_score=anomaly["z_score"],
                    baseline_mean=anomaly["baseline_mean"],
                    baseline_stdev=anomaly["baseline_stdev"],
                    current_count=anomaly["current_count"],
                    alert_message=ai_result["alert_message"],
                    week_label=anomaly["week_label"],
                    is_active=True,
                    created_at=_now_utc(),
                )
                db.add(alert_row)
                await db.commit()
                alerts_created += 1
                logger.info(
                    "Anomaly alert created",
                    extra={
                        "condition_name": anomaly["condition_name"],
                        "z_score": anomaly["z_score"],
                        "severity": ai_result["severity"],
                    },
                )
            except Exception as exc:  # noqa: BLE001
                await db.rollback()
                logger.warning(
                    "Failed to create anomaly alert",
                    extra={
                        "condition_name": anomaly["condition_name"],
                        "error": str(exc),
                    },
                )

    return {"alerts_created": alerts_created, "alerts_cleared": alerts_cleared}


@celery_app.task(name="ai_tasks.run_anomaly_detection", bind=True, max_retries=2)
def run_anomaly_detection_task(self: Any) -> dict:  # type: ignore[misc]
    """
    Nightly Celery Beat task (01:30 Asia/Manila).
    Detects illness trend anomalies and writes results to ai_anomaly_alerts.
    """
    logger.info("run_anomaly_detection_task: starting")
    try:
        result = asyncio.run(_run_anomaly_detection_async())
        logger.info("run_anomaly_detection_task: completed", extra=result)
        return result
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "run_anomaly_detection_task: fatal error",
            extra={"error": str(exc)},
        )
        raise self.retry(exc=exc, countdown=300)
