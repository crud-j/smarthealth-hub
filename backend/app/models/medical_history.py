"""
MedicalHistory ORM model.

Table: medical_history (SDP Section 4)

IMPORTANT — PHI encryption:
  ``notes`` is stored as plain TEXT in the database column but MUST be
  encrypted with AES-256-GCM at the application layer before INSERT/UPDATE
  and decrypted after SELECT.  See ``app/utils/encryption.py`` for the
  helper.  Never read/write this field directly without going through the
  encryption utility.
"""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.patient import Patient
    from app.models.user import User


class MedicalHistory(Base):
    """
    A single chronic condition or clinically significant past medical event
    recorded for a patient.

    Multiple rows per patient are expected (one per diagnosed condition).
    Cascade-deletes when the parent Patient is hard-deleted.
    """

    __tablename__ = "medical_history"
    __table_args__ = (
        sa.CheckConstraint(
            "severity IN ('mild', 'moderate', 'severe')",
            name="medical_history_severity_check",
        ),
        sa.Index("idx_medhist_patient", "patient_id"),
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
            name="fk_medical_history_patient_id_patients",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    condition_name: Mapped[str] = mapped_column(sa.String(150), nullable=False)
    # TODO: encrypted at application layer (AES-256-GCM) before insert — see app/utils/encryption.py
    notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    severity: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    diagnosed_date: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "users.id",
            name="fk_medical_history_recorded_by_users",
        ),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    # Relationships
    patient: Mapped["Patient"] = relationship(
        "Patient",
        back_populates="medical_histories",
        lazy="noload",
    )
    recorder: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[recorded_by],
        lazy="noload",
    )

    def __repr__(self) -> str:
        return (
            f"<MedicalHistory patient_id={self.patient_id} "
            f"condition={self.condition_name!r}>"
        )
