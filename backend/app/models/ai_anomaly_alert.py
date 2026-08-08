"""
AiAnomalyAlert ORM model.

Table: ai_anomaly_alerts (migration 0019)

One row per (condition_name, week_label) anomaly detected.
is_active=True rows are shown on the dashboard banner.
The nightly task deactivates the previous week's alerts before inserting new ones.
No PHI stored — condition_name is a clinical category string, not linked to any patient.
"""

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AiAnomalyAlert(Base):
    __tablename__ = "ai_anomaly_alerts"
    __table_args__ = (
        sa.CheckConstraint(
            "severity IN ('warning', 'critical')",
            name="ai_anomaly_alerts_severity_check",
        ),
        sa.Index("idx_ai_anomaly_alerts_active", "is_active"),
        sa.Index("idx_ai_anomaly_alerts_week", "week_label"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    condition_name: Mapped[str] = mapped_column(sa.String(150), nullable=False)
    severity: Mapped[str] = mapped_column(sa.String(10), nullable=False)
    z_score: Mapped[float] = mapped_column(sa.Float, nullable=False)
    baseline_mean: Mapped[float] = mapped_column(sa.Float, nullable=False)
    baseline_stdev: Mapped[float] = mapped_column(sa.Float, nullable=False)
    current_count: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    alert_message: Mapped[str] = mapped_column(sa.Text, nullable=False)
    week_label: Mapped[str] = mapped_column(sa.String(10), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("TRUE")
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("NOW()"),
    )
