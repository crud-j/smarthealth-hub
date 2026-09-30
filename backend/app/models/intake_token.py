"""
PatientIntakeToken ORM model.

Table: patient_intake_tokens

Stores single-use, expiring tokens for pre-visit patient self-entry.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.models.user import User


class PatientIntakeToken(Base):
    __tablename__ = "patient_intake_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    token: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        unique=True,
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey("users.id", name="fk_intake_tokens_created_by_users", ondelete="SET NULL"),
        nullable=True,
    )
    # When this token was created to pre-fill an existing appointment, this
    # foreign key links it so that form submission auto-marks the appointment
    # as intake-complete.
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "appointments.id",
            name="fk_intake_tokens_appointment_id_appointments",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    expires_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )
    draft_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    visit_purpose: Mapped[str | None] = mapped_column(sa.String(200), nullable=True)
    purpose_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    patient_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey("patients.id", name="fk_intake_tokens_patient_id_patients", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    created_by_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[created_by_id],
        lazy="noload",
    )
    appointment: Mapped["Appointment | None"] = relationship(
        "Appointment",
        foreign_keys=[appointment_id],
        lazy="noload",
    )
    patient: Mapped["Patient | None"] = relationship(
        "Patient",
        foreign_keys=[patient_id],
        lazy="noload",
    )

    def __repr__(self) -> str:
        return f"<PatientIntakeToken token={self.token} used={self.used_at is not None}>"
