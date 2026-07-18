"""
Immunization ORM model.

Table: immunizations (SDP Section 4)

Tracks individual vaccine doses administered to or scheduled for a patient.
The ``next_due_date`` column drives the SMS reminder scheduler — Celery beat
queries ``immunizations WHERE status='scheduled' AND next_due_date <= now() + interval``
to enqueue reminder tasks.
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
    from app.models.sms_log import SmsLog
    from app.models.user import User


class Immunization(Base):
    """
    A single vaccine dose record linked to a patient.

    Status lifecycle: scheduled → completed | missed | cancelled
    """

    __tablename__ = "immunizations"
    __table_args__ = (
        sa.CheckConstraint(
            "status IN ('scheduled', 'completed', 'missed', 'cancelled')",
            name="immunizations_status_check",
        ),
        sa.Index("idx_immun_patient", "patient_id"),
        sa.Index("idx_immun_next_due", "next_due_date"),
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
            name="fk_immunizations_patient_id_patients",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    vaccine_name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    dose_number: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("1")
    )
    date_administered: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    next_due_date: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    administered_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "users.id",
            name="fk_immunizations_administered_by_users",
        ),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default=sa.text("'scheduled'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    # Relationships
    patient: Mapped["Patient"] = relationship(
        "Patient",
        back_populates="immunizations",
        lazy="noload",
    )
    administered_by_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[administered_by],
        lazy="noload",
    )
    sms_logs: Mapped[list["SmsLog"]] = relationship(
        "SmsLog",
        back_populates="immunization",
        lazy="noload",
    )

    def __repr__(self) -> str:
        return (
            f"<Immunization patient_id={self.patient_id} "
            f"vaccine={self.vaccine_name!r} dose={self.dose_number}>"
        )
