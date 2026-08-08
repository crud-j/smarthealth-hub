"""Add ai_risk_scores and ai_anomaly_alerts tables for AI analytics features.

Revision ID: 0019
Revises: 0018
Create Date: 2026-08-01
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # ai_risk_scores
    # One row per appointment. Upserted nightly by the risk scoring task.
    # appointment_id is UNIQUE — there is exactly one current score per
    # upcoming appointment. Expired scores (expires_at < now()) are deleted
    # by the task before inserting new ones.
    # ------------------------------------------------------------------
    op.create_table(
        "ai_risk_scores",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "appointment_id",
            UUID(as_uuid=True),
            sa.ForeignKey("appointments.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("patient_code", sa.String(20), nullable=False),
        sa.Column("patient_id", UUID(as_uuid=True), nullable=False),
        sa.Column("risk_level", sa.String(10), nullable=False),
        sa.Column("risk_score", sa.Float, nullable=False),
        sa.Column("recommendation", sa.Text, nullable=False),
        sa.Column("reasoning", sa.Text, nullable=False),
        sa.Column("features_json", JSONB, nullable=False),
        sa.Column(
            "computed_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint(
            "risk_level IN ('high', 'medium', 'low')",
            name="ai_risk_scores_risk_level_check",
        ),
    )
    op.create_index(
        "idx_ai_risk_scores_risk_level",
        "ai_risk_scores",
        ["risk_level"],
    )
    op.create_index(
        "idx_ai_risk_scores_expires_at",
        "ai_risk_scores",
        ["expires_at"],
    )

    # ------------------------------------------------------------------
    # ai_anomaly_alerts
    # One row per (condition_name, week_label) pair.
    # is_active=True means the alert is shown on the dashboard.
    # The nightly task sets is_active=False on the previous week's alerts
    # before inserting the current week's new ones.
    # ------------------------------------------------------------------
    op.create_table(
        "ai_anomaly_alerts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("condition_name", sa.String(150), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("z_score", sa.Float, nullable=False),
        sa.Column("baseline_mean", sa.Float, nullable=False),
        sa.Column("baseline_stdev", sa.Float, nullable=False),
        sa.Column("current_count", sa.Integer, nullable=False),
        sa.Column("alert_message", sa.Text, nullable=False),
        sa.Column("week_label", sa.String(10), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("TRUE"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "severity IN ('warning', 'critical')",
            name="ai_anomaly_alerts_severity_check",
        ),
    )
    op.create_index(
        "idx_ai_anomaly_alerts_active",
        "ai_anomaly_alerts",
        ["is_active"],
    )
    op.create_index(
        "idx_ai_anomaly_alerts_week",
        "ai_anomaly_alerts",
        ["week_label"],
    )


def downgrade() -> None:
    op.drop_table("ai_anomaly_alerts")
    op.drop_table("ai_risk_scores")
