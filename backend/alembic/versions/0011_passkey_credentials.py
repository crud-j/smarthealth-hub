"""Add passkey_credentials table for FIDO2/WebAuthn passkey support.

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-25

Changes:
  + passkey_credentials table
      Stores FIDO2/WebAuthn authenticator registrations (passkeys) per user.
      Each row holds the raw credential_id bytes (unique), the COSE-encoded
      public key bytes, a monotonically-increasing signature counter
      (sign_count) for replay-attack detection, and optional device metadata.

      ON DELETE CASCADE — rows are removed automatically when the owning
      user account is deleted.

      UNIQUE(credential_id) — enforced by a separate constraint so the index
      name is stable across environments.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "passkey_credentials",
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                name="fk_passkey_user_id_users",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column("credential_id", sa.LargeBinary, nullable=False),
        sa.Column("public_key", sa.LargeBinary, nullable=False),
        sa.Column(
            "sign_count",
            sa.BigInteger,
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("aaguid", sa.String(36), nullable=True),
        sa.Column(
            "device_name",
            sa.String(100),
            nullable=False,
            server_default=sa.text("'My Passkey'"),
        ),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("TRUE"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("last_used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.UniqueConstraint("credential_id", name="uq_passkey_credential_id"),
    )
    op.create_index(
        "idx_passkey_user_id", "passkey_credentials", ["user_id"]
    )
    op.create_index(
        "idx_passkey_credential_id", "passkey_credentials", ["credential_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_passkey_credential_id", table_name="passkey_credentials")
    op.drop_index("idx_passkey_user_id", table_name="passkey_credentials")
    op.drop_table("passkey_credentials")
