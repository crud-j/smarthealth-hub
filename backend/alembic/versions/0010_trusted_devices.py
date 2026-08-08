"""Add trusted_devices table for "Remember this device" OTP skip (L-1).

Revision ID: 0010
Revises: 0008
Create Date: 2026-07-20

Changes:
  + trusted_devices table
      Stores a client-generated device fingerprint per user so a recognized
      device can skip the OTP step on subsequent logins for up to 30 days.

      This is a UX convenience, NOT a cryptographic device attestation — the
      fingerprint is derived client-side from navigator.userAgent, screen
      dimensions, and language (see frontend/web/app/(auth)/login/page.tsx).
      It can be spoofed by a motivated attacker who already has the victim's
      password. The OTP-based MFA flow remains the authoritative second
      factor; this table only lets a *previously verified* device on the
      *same browser profile* bypass repeated OTP prompts for convenience.

      UNIQUE(user_id, device_fingerprint) — one row per (user, device) pair;
      re-checking "remember this device" on the same browser updates
      expires_at / last_seen_at on the existing row instead of duplicating.

      ON DELETE CASCADE — trusted device rows are removed automatically when
      the owning user is deleted.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0010"
down_revision: str | None = "0008"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "trusted_devices",
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
                name="fk_trusted_devices_user_id_users",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column("device_fingerprint", sa.String(64), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "last_seen_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "user_id", "device_fingerprint", name="uq_trusted_devices_user_fingerprint"
        ),
    )
    op.create_index(
        "idx_trusted_device_user", "trusted_devices", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_trusted_device_user", table_name="trusted_devices")
    op.drop_table("trusted_devices")
