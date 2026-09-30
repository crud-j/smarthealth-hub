"""
AiRiskScore ORM model.

Table: ai_risk_scores (migration 0019)

One row per upcoming appointment. Upserted nightly by ai_tasks.run_risk_scoring_task.
Columns contain ZERO PHI — patient_code is the only patient identifier stored.
patient_id is stored solely so the dashboard can build a /patients/{id} link
without a join, but it is never sent to external services.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.appointment import Appointment


class AiRiskScore(Base):
    __tablename__ = "ai_risk_scores"
    __table_args__ = (
        sa.CheckConstraint(
            "risk_level IN ('high', 'medium', 'low')",
            name="ai_risk_scores_risk_level_check",
        ),
        sa.Index("idx_ai_risk_scores_risk_level", "risk_level"),
        sa.Index("idx_ai_risk_scores_expires_at", "expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    appointment_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey("appointments.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    # patient_id stored for frontend linking — NOT sent to OpenAI
    patient_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    patient_code: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    risk_level: Mapped[str] = mapped_column(sa.String(10), nullable=False)
    risk_score: Mapped[float] = mapped_column(sa.Float, nullable=False)
    recommendation: Mapped[str] = mapped_column(sa.Text, nullable=False)
    reasoning: Mapped[str] = mapped_column(sa.Text, nullable=False)
    features_json: Mapped[dict] = mapped_column(JSONB, nullable=False)  # type: ignore[type-arg]
    computed_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("NOW()"),
    )
    expires_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True), nullable=True)

    appointment: Mapped["Appointment"] = relationship("Appointment", foreign_keys=[appointment_id])
