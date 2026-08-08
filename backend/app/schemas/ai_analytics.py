"""
Pydantic v2 schemas for AI analytics endpoints.

Schemas:
  RiskLevel              — Enum: "high" | "medium" | "low"
  AppointmentRiskScore   — Single row returned by GET /analytics/ai/no-show-risk
  NoShowRiskResponse     — Full response with summary counts
  AnomalySeverity        — Enum: "warning" | "critical"
  AnomalyAlert           — Single alert row
  AnomalyAlertsResponse  — Full response for GET /analytics/ai/anomaly-alerts
  TriggerTaskResponse    — Response for manual trigger endpoints
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import Field

from app.schemas._base import BaseSchema


class RiskLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class AppointmentRiskScore(BaseSchema):
    """
    One risk score row for an upcoming appointment.
    patient_id is included so the frontend can link to /patients/{patient_id}.
    It is never sent to OpenAI — see features_json for what was.
    """

    appointment_id: uuid.UUID
    patient_id: uuid.UUID
    patient_code: str
    risk_level: RiskLevel
    risk_score: float = Field(ge=0.0, le=1.0)
    recommendation: str
    reasoning: str
    computed_at: datetime
    expires_at: datetime | None = None


class NoShowRiskResponse(BaseSchema):
    items: list[AppointmentRiskScore]
    total: int = Field(ge=0)
    high_risk_count: int = Field(ge=0)
    generated_at: datetime


class AnomalySeverity(str, Enum):
    WARNING = "warning"
    CRITICAL = "critical"


class AnomalyAlert(BaseSchema):
    id: uuid.UUID
    condition_name: str
    severity: AnomalySeverity
    z_score: float
    current_count: int = Field(ge=0)
    baseline_mean: float
    baseline_stdev: float
    alert_message: str
    week_label: str
    created_at: datetime


class AnomalyAlertsResponse(BaseSchema):
    alerts: list[AnomalyAlert]
    total: int = Field(ge=0)
    generated_at: datetime


class TriggerTaskResponse(BaseSchema):
    task_id: str
    status: str
