"""
Role and User ORM models.

Both models live in the same file because Role is a small lookup table that
is tightly coupled to User (every User has exactly one Role).

Tables (SDP Section 4):
  - roles
  - users

Security note: password_hash uses Argon2 via passlib — never store plaintext
passwords.  MFA OTP codes are stored in the separate mfa_otp table.
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
    # Avoid circular imports at runtime; only needed for type checkers.
    from app.models.audit_log import AuditLog
    from app.models.mfa_otp import MfaOtp
    from app.models.patient import Patient
    from app.models.visit import Visit


# ---------------------------------------------------------------------------
# Role
# ---------------------------------------------------------------------------


class Role(Base):
    """
    Lookup table for RBAC roles.

    Seeded roles: admin | bhw | physician | admin_staff
    The ``permissions`` JSONB column stores a dict of module → action list,
    e.g. ``{"patients": ["read", "write"], "analytics": ["read"]}``.
    """

    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(sa.String(50), unique=True, nullable=False)
    permissions: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    # Relationships
    users: Mapped[list["User"]] = relationship(
        "User",
        back_populates="role",
        lazy="noload",  # loaded on demand — full user list is rarely needed
    )

    def __repr__(self) -> str:
        return f"<Role name={self.name!r}>"


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------


class User(Base):
    """
    System user (BHW, Physician/Nurse/Midwife, Admin, Admin Staff).

    ``mobile_number`` is used both for SMS OTP delivery and as a unique
    contact identifier — it must be in E.164 format (e.g. +639171234567).
    """

    __tablename__ = "users"
    __table_args__ = (
        sa.Index("idx_users_role", "role_id"),
        sa.Index("idx_users_email", "email"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    full_name: Mapped[str] = mapped_column(sa.String(150), nullable=False)
    email: Mapped[str] = mapped_column(sa.String(150), unique=True, nullable=False)
    mobile_number: Mapped[str] = mapped_column(sa.String(20), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(sa.Text, nullable=False)
    role_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey("roles.id", name="fk_users_role_id_roles"),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("TRUE")
    )
    mfa_enabled: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("TRUE")
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
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
    role: Mapped["Role"] = relationship(
        "Role",
        back_populates="users",
        lazy="selectin",  # almost always needed alongside User
    )
    mfa_otps: Mapped[list["MfaOtp"]] = relationship(
        "MfaOtp",
        back_populates="user",
        lazy="noload",
        cascade="all, delete-orphan",
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog",
        back_populates="user",
        lazy="noload",
    )
    recorded_visits: Mapped[list["Visit"]] = relationship(
        "Visit",
        back_populates="recorder",
        foreign_keys="Visit.recorded_by",
        lazy="noload",
    )
    # Patients created by this user (no back_populates on Patient side per spec)
    created_patients: Mapped[list["Patient"]] = relationship(
        "Patient",
        back_populates="created_by_user",
        foreign_keys="Patient.created_by",
        lazy="noload",
    )

    def __repr__(self) -> str:
        return f"<User email={self.email!r} role_id={self.role_id}>"
