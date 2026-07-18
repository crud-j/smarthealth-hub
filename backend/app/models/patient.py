"""
Patient ORM model.

Table: patients (SDP Section 4)

PHI sensitivity: ALL columns in this table are considered personal health
information (PHI) except ``id``, ``patient_code``, ``is_active``,
``created_at``, ``updated_at``.  Access must be RBAC-gated and every
read/write of this record must produce an audit_log entry.

Special demographic flags:
  - is_pwd      — Person with Disability (priority queuing)
  - is_senior   — Senior Citizen (60+)
  - is_pregnant — Current pregnancy status (updated per visit)
"""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.appointment import Appointment
    from app.models.health_card import HealthCard
    from app.models.immunization import Immunization
    from app.models.medical_history import MedicalHistory
    from app.models.sms_log import SmsLog
    from app.models.user import User
    from app.models.visit import Visit


class Patient(Base):
    """
    Central patient record.  All clinical sub-records (medical history,
    immunizations, visits, appointments, health card) cascade-delete when
    a patient record is hard-deleted — in practice, records should be
    soft-deleted via ``is_active = False``.
    """

    __tablename__ = "patients"
    __table_args__ = (
        sa.CheckConstraint("sex IN ('male', 'female')", name="patients_sex_check"),
        sa.CheckConstraint(
            "philhealth_member_type IN ('member', 'dependent')",
            name="patients_philhealth_member_type_check",
        ),
        sa.Index("idx_patients_name", "last_name", "first_name"),
        sa.Index("idx_patients_code", "patient_code"),
        sa.Index("idx_patients_mobile", "mobile_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    patient_code: Mapped[str] = mapped_column(
        sa.String(20), unique=True, nullable=False
    )
    first_name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    last_name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    birth_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    sex: Mapped[str] = mapped_column(sa.String(10), nullable=False)
    civil_status: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    mobile_number: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    address: Mapped[str] = mapped_column(sa.Text, nullable=False)
    guardian_name: Mapped[str | None] = mapped_column(sa.String(150), nullable=True)
    guardian_contact: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    philhealth_no: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    # RHU form: "PHILHEALTH MEMBER / DEPENDENTS" radio — 'member' or 'dependent'
    philhealth_member_type: Mapped[str | None] = mapped_column(
        sa.String(20), nullable=True
    )
    is_pwd: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("FALSE")
    )
    is_senior: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("FALSE")
    )
    is_pregnant: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("FALSE")
    )
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("TRUE")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey("users.id", name="fk_patients_created_by_users"),
        nullable=True,
    )
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
    created_by_user: Mapped["User | None"] = relationship(
        "User",
        back_populates="created_patients",
        foreign_keys=[created_by],
        lazy="noload",
    )
    medical_histories: Mapped[list["MedicalHistory"]] = relationship(
        "MedicalHistory",
        back_populates="patient",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    immunizations: Mapped[list["Immunization"]] = relationship(
        "Immunization",
        back_populates="patient",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    appointments: Mapped[list["Appointment"]] = relationship(
        "Appointment",
        back_populates="patient",
        lazy="noload",
        cascade="all, delete-orphan",
    )
    visits: Mapped[list["Visit"]] = relationship(
        "Visit",
        back_populates="patient",
        lazy="noload",
        cascade="all, delete-orphan",
    )
    health_card: Mapped["HealthCard | None"] = relationship(
        "HealthCard",
        back_populates="patient",
        uselist=False,  # one-to-one
        lazy="noload",
        cascade="all, delete-orphan",
    )
    sms_logs: Mapped[list["SmsLog"]] = relationship(
        "SmsLog",
        back_populates="patient",
        lazy="noload",
    )

    def __repr__(self) -> str:
        return (
            f"<Patient code={self.patient_code!r} "
            f"name={self.last_name!r}, {self.first_name!r}>"
        )
