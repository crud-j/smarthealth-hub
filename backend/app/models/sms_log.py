"""
SmsLog ORM model.

Table: sms_logs (SDP Section 4)

Records every SMS dispatch attempt.  The Semaphore delivery webhook
(``POST /sms/webhook/delivery-status``) updates ``status`` and
``provider_message_id`` when Semaphore reports delivery/failure.

FK design:
  - patient_id / appointment_id / immunization_id are all nullable with
    ON DELETE SET NULL — an SMS log must survive even if the linked entity
    is deleted, so the audit trail is preserved.

Status lifecycle: queued → sent → delivered | failed
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.appointment import Appointment
    from app.models.immunization import Immunization
    from app.models.patient import Patient


class SmsLog(Base):
    """
    Append-only record of an SMS dispatch attempt via the Semaphore API.

    ``mobile_number`` is stored in E.164 format (+63...).
    ``message`` is the full SMS body as sent (plain text, max 160 chars per
    segment — Semaphore handles concatenation for longer messages).
    ``error_detail`` captures the Semaphore API error body on failure for
    debugging; it may contain no PHI.
    """

    __tablename__ = "sms_logs"
    __table_args__ = (
        sa.CheckConstraint(
            "status IN ('queued', 'sent', 'failed', 'delivered')",
            name="sms_logs_status_check",
        ),
        sa.Index("idx_sms_patient", "patient_id"),
        sa.Index("idx_sms_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    patient_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "patients.id",
            name="fk_sms_logs_patient_id_patients",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "appointments.id",
            name="fk_sms_logs_appointment_id_appointments",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    immunization_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "immunizations.id",
            name="fk_sms_logs_immunization_id_immunizations",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    mobile_number: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    message: Mapped[str] = mapped_column(sa.Text, nullable=False)
    status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default=sa.text("'queued'"),
    )
    provider_message_id: Mapped[str | None] = mapped_column(
        sa.String(100), nullable=True
    )
    error_detail: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    # Relationships
    patient: Mapped["Patient | None"] = relationship(
        "Patient",
        back_populates="sms_logs",
        lazy="noload",
    )
    appointment: Mapped["Appointment | None"] = relationship(
        "Appointment",
        back_populates="sms_logs",
        foreign_keys=[appointment_id],
        lazy="noload",
    )
    immunization: Mapped["Immunization | None"] = relationship(
        "Immunization",
        back_populates="sms_logs",
        foreign_keys=[immunization_id],
        lazy="noload",
    )

    def __repr__(self) -> str:
        return (
            f"<SmsLog mobile={self.mobile_number!r} "
            f"status={self.status!r}>"
        )
