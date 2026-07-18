"""
MfaOtp ORM model.

Table: mfa_otp (SDP Section 4)

OTP codes are hashed (Argon2 via passlib) before storage — the plaintext
code is NEVER persisted.  On verification:
  1. Fetch the MfaOtp row by user_id WHERE is_used=FALSE AND expires_at > now()
  2. Use passlib.hash.argon2.verify(submitted_code, row.otp_code_hash)
  3. If valid: set is_used=TRUE and commit
  4. Enforce attempt_count limit (≤ 5) to prevent brute-force

A Celery beat task (``tasks.cleanup_expired_otps``) should periodically
DELETE rows WHERE expires_at < now() - interval '1 day' to prevent table bloat.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class MfaOtp(Base):
    """
    Single-use, time-limited OTP token.

    ``purpose`` distinguishes login OTPs from password-reset OTPs so that
    a login OTP cannot be replayed to reset a password.
    """

    __tablename__ = "mfa_otp"
    __table_args__ = (
        sa.CheckConstraint(
            "purpose IN ('login', 'password_reset')",
            name="mfa_otp_purpose_check",
        ),
        sa.Index("idx_otp_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "users.id",
            name="fk_mfa_otp_user_id_users",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    # Argon2 hash of the 6-digit OTP code — never store plaintext
    otp_code_hash: Mapped[str] = mapped_column(sa.Text, nullable=False)
    purpose: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default=sa.text("'login'"),
    )
    expires_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False
    )
    is_used: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("FALSE")
    )
    # Tracks failed verification attempts to enforce brute-force limit
    attempt_count: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        back_populates="mfa_otps",
        lazy="noload",
    )

    def __repr__(self) -> str:
        return (
            f"<MfaOtp user_id={self.user_id} "
            f"purpose={self.purpose!r} is_used={self.is_used}>"
        )
