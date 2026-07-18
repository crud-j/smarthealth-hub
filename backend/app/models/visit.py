"""
Visit ORM model.

Table: visits (SDP Section 4)

IMPORTANT — PHI encryption:
  ``diagnosis`` and ``treatment_notes`` are stored as plain TEXT in the DB
  but MUST be encrypted with AES-256-GCM at the application layer before
  INSERT/UPDATE and decrypted after SELECT.
  See ``app/utils/encryption.py`` for the encryption helper.
  Access to these fields must be restricted to Physician/Nurse/Midwife and
  Admin roles.  Every SELECT that reads these fields must emit an audit_log
  entry with action="VIEW_PHI".
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.patient import Patient
    from app.models.user import User


class Visit(Base):
    """
    A single clinical visit / consultation record.

    One patient may have many visits over time.  ``visit_type`` examples:
    "consultation", "prenatal_checkup", "immunization_admin", "follow_up",
    "emergency".
    """

    __tablename__ = "visits"
    __table_args__ = (
        sa.Index("idx_visits_patient", "patient_id"),
        sa.Index("idx_visits_date", "visit_date"),
        sa.Index("idx_visits_case_no", "case_no"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "patients.id",
            name="fk_visits_patient_id_patients",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "users.id",
            name="fk_visits_recorded_by_users",
        ),
        nullable=True,
    )
    visit_date: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )
    # RHU form CASE NO. column — auto-generated: BHC-VISIT-YYYY-NNNNNN
    case_no: Mapped[str | None] = mapped_column(
        sa.String(30), unique=True, nullable=True
    )
    visit_type: Mapped[str] = mapped_column(sa.String(50), nullable=False)

    # ---- Vital signs (VITAL SIGNS column on the RHU physical form) -----------
    # All nullable — not every visit type requires all vitals.
    blood_pressure: Mapped[str | None] = mapped_column(
        sa.String(20), nullable=True
    )  # e.g. "120/80 mmHg"
    temperature: Mapped[float | None] = mapped_column(
        sa.Numeric(4, 1), nullable=True
    )  # degrees Celsius
    pulse_rate: Mapped[int | None] = mapped_column(
        sa.Integer, nullable=True
    )  # beats per minute
    respiratory_rate: Mapped[int | None] = mapped_column(
        sa.Integer, nullable=True
    )  # breaths per minute
    oxygen_saturation: Mapped[int | None] = mapped_column(
        sa.Integer, nullable=True
    )  # SpO2 %
    weight_kg: Mapped[float | None] = mapped_column(
        sa.Numeric(5, 2), nullable=True
    )  # kilograms
    height_cm: Mapped[float | None] = mapped_column(
        sa.Numeric(5, 1), nullable=True
    )  # centimeters

    # ---- Complaint and history -----------------------------------------------
    chief_complaint: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    # PAST MEDICAL HISTORY on the RHU form — prior conditions relevant to this visit
    past_medical_history: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    # PRESENT MEDICAL HISTORY on the RHU form — history of presenting illness
    present_medical_history: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    # ---- Encrypted PHI fields ------------------------------------------------
    # Both fields are AES-256-GCM encrypted at the application layer before INSERT.
    # See app/utils/encryption.py.  Access restricted to Physician/Admin roles.
    diagnosis: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    treatment_notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    # Relationships
    patient: Mapped["Patient"] = relationship(
        "Patient",
        back_populates="visits",
        lazy="noload",
    )
    recorder: Mapped["User | None"] = relationship(
        "User",
        back_populates="recorded_visits",
        foreign_keys=[recorded_by],
        lazy="noload",
    )

    def __repr__(self) -> str:
        return (
            f"<Visit patient_id={self.patient_id} "
            f"type={self.visit_type!r} date={self.visit_date}>"
        )
