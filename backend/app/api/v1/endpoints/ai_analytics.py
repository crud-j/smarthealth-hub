"""
AI analytics endpoints.

Routes:
  GET  /analytics/ai/no-show-risk
       Latest risk scores for upcoming appointments, ordered by risk_score DESC.
       Query params: limit (1–50, default 10), risk_level (optional filter).
       Auth: Any authenticated user.

  GET  /analytics/ai/anomaly-alerts
       Active anomaly alerts for the current ISO week.
       Auth: Any authenticated user.

  POST /analytics/ai/trigger-scoring
       Manually trigger the risk scoring Celery task.
       Auth: Admin role only.

  POST /analytics/ai/trigger-anomaly-detection
       Manually trigger the anomaly detection Celery task.
       Auth: Admin role only.

All routes require JWT auth via get_current_user.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.core.security import CurrentUser, require_role
from app.db.session import DbDep
from app.schemas.ai_analytics import (
    AnomalyAlertsResponse,
    AnomalyAlert,
    AppointmentRiskScore,
    NoShowRiskResponse,
    TriggerTaskResponse,
)

router = APIRouter(prefix="/analytics", tags=["ai-analytics"])


@router.get("/ai/no-show-risk", response_model=NoShowRiskResponse)
async def get_no_show_risk(
    db: DbDep,
    current_user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    risk_level: Annotated[
        Literal["high", "medium", "low"] | None, Query()
    ] = None,
) -> NoShowRiskResponse:
    """
    Return the latest AI-computed risk scores for upcoming appointments,
    ordered by risk_score descending (highest risk first).
    Optionally filter by risk_level.
    """
    from sqlalchemy import select
    from app.models.ai_risk_score import AiRiskScore

    stmt = select(AiRiskScore).order_by(AiRiskScore.risk_score.desc())
    if risk_level is not None:
        stmt = stmt.where(AiRiskScore.risk_level == risk_level)
    stmt = stmt.limit(limit)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    # Count totals (unfiltered by risk_level for summary)
    from sqlalchemy import func
    total_stmt = select(func.count(AiRiskScore.id))
    high_stmt = select(func.count(AiRiskScore.id)).where(
        AiRiskScore.risk_level == "high"
    )
    total_result = await db.execute(total_stmt)
    high_result = await db.execute(high_stmt)
    total = total_result.scalar_one_or_none() or 0
    high_risk_count = high_result.scalar_one_or_none() or 0

    items = [
        AppointmentRiskScore(
            appointment_id=row.appointment_id,
            patient_id=row.patient_id,
            patient_code=row.patient_code,
            risk_level=row.risk_level,
            risk_score=row.risk_score,
            recommendation=row.recommendation,
            reasoning=row.reasoning,
            computed_at=row.computed_at,
            expires_at=row.expires_at,
        )
        for row in rows
    ]

    return NoShowRiskResponse(
        items=items,
        total=total,
        high_risk_count=high_risk_count,
        generated_at=datetime.now(tz=timezone.utc),
    )


@router.get("/ai/anomaly-alerts", response_model=AnomalyAlertsResponse)
async def get_anomaly_alerts(
    db: DbDep,
    current_user: CurrentUser,
) -> AnomalyAlertsResponse:
    """
    Return active anomaly alerts (is_active=True), ordered by z_score descending.
    """
    from sqlalchemy import select
    from app.models.ai_anomaly_alert import AiAnomalyAlert

    stmt = (
        select(AiAnomalyAlert)
        .where(AiAnomalyAlert.is_active.is_(True))
        .order_by(AiAnomalyAlert.z_score.desc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    alerts = [
        AnomalyAlert(
            id=row.id,
            condition_name=row.condition_name,
            severity=row.severity,
            z_score=row.z_score,
            current_count=row.current_count,
            baseline_mean=row.baseline_mean,
            baseline_stdev=row.baseline_stdev,
            alert_message=row.alert_message,
            week_label=row.week_label,
            created_at=row.created_at,
        )
        for row in rows
    ]

    return AnomalyAlertsResponse(
        alerts=alerts,
        total=len(alerts),
        generated_at=datetime.now(tz=timezone.utc),
    )


@router.post(
    "/ai/trigger-scoring",
    response_model=TriggerTaskResponse,
    dependencies=[require_role("admin")],
)
async def trigger_risk_scoring(current_user: CurrentUser) -> TriggerTaskResponse:
    """
    Manually enqueue the risk scoring Celery task. Admin only.
    Returns the Celery task ID for status tracking.
    """
    from app.workers.ai_tasks import run_risk_scoring_task

    task = run_risk_scoring_task.delay()
    return TriggerTaskResponse(task_id=task.id, status="queued")


@router.post(
    "/ai/trigger-anomaly-detection",
    response_model=TriggerTaskResponse,
    dependencies=[require_role("admin")],
)
async def trigger_anomaly_detection(
    current_user: CurrentUser,
) -> TriggerTaskResponse:
    """
    Manually enqueue the anomaly detection Celery task. Admin only.
    """
    from app.workers.ai_tasks import run_anomaly_detection_task

    task = run_anomaly_detection_task.delay()
    return TriggerTaskResponse(task_id=task.id, status="queued")
