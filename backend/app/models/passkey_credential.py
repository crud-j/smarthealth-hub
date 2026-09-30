"""
PasskeyCredential ORM model.

Table: passkey_credentials (migration 0011_passkey_credentials)

Stores FIDO2/WebAuthn authenticator registrations (passkeys) for staff
users.  Each row represents one registered authenticator (e.g. Windows
Hello, Touch ID, a hardware security key).

Security notes:
  - ``credential_id`` is the raw bytes returned by the authenticator during
    registration; it is unique across all users.
  - ``public_key`` is the COSE-encoded ECDSA/RSA public key bytes returned
    by py_webauthn's verify_registration_response(); never the private key.
  - ``sign_count`` is the authenticator's monotonically-increasing counter
    used to detect credential cloning (replay-attack mitigation).
  - No PHI is stored here; this table only contains auth-ceremony artifacts.
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


class PasskeyCredential(Base):
    """
    A FIDO2/WebAuthn credential registered by a user (one row per authenticator).
    """

    __tablename__ = "passkey_credentials"
    __table_args__ = (
        sa.Index("idx_passkey_user_id", "user_id"),
        sa.Index("idx_passkey_credential_id", "credential_id"),
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
            name="fk_passkey_user_id_users",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    # Raw credential ID bytes returned by the authenticator at registration.
    credential_id: Mapped[bytes] = mapped_column(sa.LargeBinary, nullable=False, unique=True)
    # COSE-encoded public key bytes (output of verify_registration_response).
    public_key: Mapped[bytes] = mapped_column(sa.LargeBinary, nullable=False)
    # Authenticator signature counter — used for clone/replay detection.
    sign_count: Mapped[int] = mapped_column(
        sa.BigInteger, nullable=False, server_default=sa.text("0")
    )
    # AAGUID identifies the authenticator model (optional, may be zeroed out
    # by privacy-preserving authenticators).
    aaguid: Mapped[str | None] = mapped_column(sa.String(36), nullable=True)
    # Human-readable label set by the user at registration time.
    device_name: Mapped[str] = mapped_column(
        sa.String(100), nullable=False, server_default=sa.text("'My Passkey'")
    )
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("TRUE")
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        back_populates="passkey_credentials",
        lazy="noload",
    )

    def __repr__(self) -> str:
        return (
            f"<PasskeyCredential user_id={self.user_id} "
            f"device_name={self.device_name!r} is_active={self.is_active}>"
        )
