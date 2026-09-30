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
        sa.CheckConstraint(
            "philhealth_category IN ('indigent', 'sponsored', 'formal_economy', 'informal_economy', 'lifetime_member') OR philhealth_category IS NULL",
            name="patients_philhealth_category_check",
        ),
        sa.CheckConstraint(
            "registration_source IN ('walk_in', 'referral', 'outreach', 'others') OR registration_source IS NULL",
            name="patients_registration_source_check",
        ),
        sa.CheckConstraint(
            "blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown') OR blood_type IS NULL",
            name="patients_blood_type_check",
        ),
        sa.Index("idx_patients_name", "last_name", "first_name"),
        sa.Index("idx_patients_code", "patient_code"),
        sa.Index("idx_patients_mobile", "mobile_number"),
        sa.Index("idx_patients_philhealth_no", "philhealth_no"),
        sa.Index("idx_patients_household_number", "household_number"),
        sa.Index("idx_patients_barangay", "barangay"),
        sa.Index("idx_patients_municipality", "municipality"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    patient_code: Mapped[str] = mapped_column(sa.String(20), unique=True, nullable=False)
    first_name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    last_name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    birth_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    sex: Mapped[str] = mapped_column(sa.String(10), nullable=False)
    civil_status: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    household_number: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)
    sitio_purok: Mapped[str | None] = mapped_column(sa.String(150), nullable=True)
    barangay: Mapped[str | None] = mapped_column(sa.String(150), nullable=True)
    municipality: Mapped[str | None] = mapped_column(sa.String(150), nullable=True)
    province: Mapped[str | None] = mapped_column(sa.String(150), nullable=True)
    occupation: Mapped[str | None] = mapped_column(sa.String(150), nullable=True)
    mobile_number: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    address: Mapped[str] = mapped_column(sa.Text, nullable=False)
    guardian_name: Mapped[str | None] = mapped_column(sa.String(150), nullable=True)
    guardian_contact: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(sa.String(150), nullable=True)
    emergency_contact_number: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    philhealth_no: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    # RHU form: "PHILHEALTH MEMBER / DEPENDENTS" radio — 'member' or 'dependent'
    philhealth_member_type: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    philhealth_category: Mapped[str | None] = mapped_column(sa.String(40), nullable=True)
    is_4ps_beneficiary: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("FALSE")
    )
    household_id_4ps: Mapped[str | None] = mapped_column(sa.String(80), nullable=True)
    is_indigenous: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("FALSE")
    )
    place_of_birth: Mapped[str | None] = mapped_column(sa.String(150), nullable=True)
    mothers_maiden_name: Mapped[str | None] = mapped_column(sa.String(150), nullable=True)
    senior_id_number: Mapped[str | None] = mapped_column(sa.String(80), nullable=True)
    pwd_id_number: Mapped[str | None] = mapped_column(sa.String(80), nullable=True)
    last_menstrual_period: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    gravida: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    para: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    estimated_due_date: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    height_cm: Mapped[float | None] = mapped_column(sa.Numeric(5, 1), nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(sa.Numeric(5, 2), nullable=True)
    allergies: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    known_conditions: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    registration_source: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    data_privacy_consent: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("FALSE")
    )
    data_privacy_consent_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
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
    # ABO/Rh blood group. NULL when not recorded at registration time.
    # Allowed values enforced by patients_blood_type_check DB constraint and
    # by the Pydantic Literal validator in PatientCreate / PatientUpdate.
    blood_type: Mapped[str | None] = mapped_column(sa.String(10), nullable=True)
    # Profile photo — stores a relative path inside backend/media/ (e.g.
    # "patient_photos/<uuid>.jpg").  NULL means no photo has been uploaded.
    # Access to the photo file is gated behind JWT auth just like other PHI.
    photo_path: Mapped[str | None] = mapped_column(sa.String(512), nullable=True)

    # Archive fields — distinct from is_active deactivation.
    # An archived patient is hidden from normal list/search but all clinical
    # records are preserved.  Only Admins can archive / unarchive.
    archived_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True), nullable=True)
    archived_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey("users.id", name="fk_patients_archived_by_users", ondelete="SET NULL"),
        nullable=True,
    )
    archive_reason: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    # SMS opt-out flag — set to True when the patient replies STOP to any
    # reminder SMS.  The reminder scheduler skips patients with this flag.
    sms_opt_out: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=False, server_default=sa.text("FALSE")
    )

    # Preferred language for SMS templates ('en' or 'fil').
    # Defaults to English; used by the scheduler to select the correct template
    # when Filipino ('fil') variants are added to the SMS_TEMPLATES registry.
    preferred_language: Mapped[str] = mapped_column(
        sa.String(5), nullable=False, default="en", server_default=sa.text("'en'")
    )

    # How the patient record was entered.
    # Values: 'manual' (default) | 'ocr' (ID scan autofill) | 'pre_visit' (patient self-entry link)
    registration_data_source: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default=sa.text("'manual'"),
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
        lazy="noload",
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
        return f"<Patient code={self.patient_code!r} name={self.last_name!r}, {self.first_name!r}>"
