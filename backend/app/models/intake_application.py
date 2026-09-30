"""
IntakeApplication ORM model.

Table: intake_applications

Stores public self-registration applications submitted via the open
/register page.  These are NOT patient records — they are held in a
pending state until an Admin reviews and either:
  - Approves  → a Patient row is created; application.patient_id is set
  - Rejects   → application.rejection_reason is recorded

This is separate from the appointment-linked PatientIntakeToken flow
which requires a staff member to first generate a token via SMS.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.patient import Patient
    from app.models.user import User


class IntakeApplication(Base):
    __tablename__ = "intake_applications"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    reference_number: Mapped[str] = mapped_column(sa.String(20), nullable=False, unique=True)
    # lifecycle: 'pending' | 'approved' | 'rejected'
    status: Mapped[str] = mapped_column(
        sa.String(20), nullable=False, server_default=sa.text("'pending'")
    )
    # Complete form submission stored as JSONB
    form_data: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Medical background fields (stored plain — applicant not yet a patient)
    known_allergies: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    current_medications: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    pre_existing_conditions: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    # Review
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "users.id", name="fk_intake_applications_reviewed_by_users", ondelete="SET NULL"
        ),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    # Set after approval
    patient_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "patients.id", name="fk_intake_applications_patient_id_patients", ondelete="SET NULL"
        ),
        nullable=True,
    )

    submitted_ip: Mapped[str | None] = mapped_column(sa.String(45), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
        onupdate=sa.text("now()"),
    )

    # Relationships
    reviewed_by_user: Mapped[User | None] = relationship(
        "User",
        foreign_keys=[reviewed_by_id],
        lazy="noload",
    )
    patient: Mapped[Patient | None] = relationship(
        "Patient",
        foreign_keys=[patient_id],
        lazy="noload",
    )

    def __repr__(self) -> str:
        return f"<IntakeApplication ref={self.reference_number!r} status={self.status!r}>"
