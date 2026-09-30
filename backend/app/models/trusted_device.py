"""
TrustedDevice ORM model.

Table: trusted_devices (migration 0010_trusted_devices)

Backs the "Remember this device for 30 days" OTP-skip feature (SDP Section
5.1 "Should" requirement, L-1 in the remediation backlog).

IMPORTANT — this is a UX convenience, not a cryptographic device
attestation. ``device_fingerprint`` is derived client-side from
navigator.userAgent + screen dimensions + language (see
frontend/web/app/(auth)/login/page.tsx) and can be spoofed by anyone who
already has the victim's password. The OTP flow remains the authoritative
second factor; a matching trusted-device row only skips a *repeat* OTP
prompt for a browser that has already completed OTP verification once.
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


class TrustedDevice(Base):
    """
    A device fingerprint recognized for a given user, allowing the OTP step
    to be skipped on login until ``expires_at``.
    """

    __tablename__ = "trusted_devices"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id", "device_fingerprint", name="uq_trusted_devices_user_fingerprint"
        ),
        sa.Index("idx_trusted_device_user", "user_id"),
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
            name="fk_trusted_devices_user_id_users",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    # Client-generated fingerprint — see module docstring for what this is
    # (and is not) a guarantee of.
    device_fingerprint: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )
    expires_at: Mapped[datetime] = mapped_column(sa.TIMESTAMP(timezone=True), nullable=False)

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        lazy="noload",
    )

    def __repr__(self) -> str:
        return (
            f"<TrustedDevice user_id={self.user_id} "
            f"fingerprint={self.device_fingerprint[:8]}... expires_at={self.expires_at}>"
        )
