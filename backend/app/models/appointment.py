"""
Appointment ORM model.

Table: appointments (SDP Section 4)

Appointments are the trigger for SMS reminders: when an appointment is
created or rescheduled, a Celery task is enqueued to send an SMS reminder
``settings.SMS_REMINDER_LEAD_HOURS`` before ``scheduled_at``.

Status lifecycle: pending → confirmed → completed | missed | cancelled
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
    from app.models.sms_log import SmsLog
    from app.models.user import User


class Appointment(Base):
    """
    A scheduled patient appointment at the Barangay Health Center.

    ``appointment_type`` examples: "prenatal", "immunization", "general_checkup",
    "follow_up", "dental", "family_planning".
    """

    __tablename__ = "appointments"
    __table_args__ = (
        sa.CheckConstraint(
            "status IN ('pending', 'confirmed', 'completed', 'missed', 'cancelled')",
            name="appointments_status_check",
        ),
        sa.Index("idx_appt_patient", "patient_id"),
        sa.Index("idx_appt_schedule", "scheduled_at"),
        sa.Index("idx_appt_status", "status"),
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
            name="fk_appointments_patient_id_patients",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    appointment_type: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False
    )
    status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default=sa.text("'pending'"),
    )
    notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "users.id",
            name="fk_appointments_created_by_users",
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
        back_populates="appointments",
        lazy="noload",
    )
    created_by_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[created_by],
        lazy="noload",
    )
    sms_logs: Mapped[list["SmsLog"]] = relationship(
        "SmsLog",
        back_populates="appointment",
        lazy="noload",
    )

    def __repr__(self) -> str:
        return (
            f"<Appointment patient_id={self.patient_id} "
            f"type={self.appointment_type!r} scheduled_at={self.scheduled_at}>"
        )
