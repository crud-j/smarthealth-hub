"""Add refresh_token_hash column to users table for rotation tracking.

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-20

Changes:
  users table:
    + refresh_token_hash VARCHAR(64) NULL
      Stores the SHA-256 hex digest of the most recently issued refresh token.
      On refresh token rotation the stored hash is replaced with the new
      token's hash.  On logout the column is set to NULL, immediately
      invalidating any outstanding refresh token.

    + idx_users_refresh_token_hash ON users(refresh_token_hash)
      Supports efficient lookup by hash (used in the rotation-tracking
      validation step in auth_service.refresh_access_token).

Security note:
  Only the SHA-256 hash is stored — the plaintext refresh token is never
  persisted.  A stolen hash does not allow an attacker to forge a refresh
  token because the JWT signature still needs to be valid.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("refresh_token_hash", sa.String(64), nullable=True),
    )
    op.create_index(
        "idx_users_refresh_token_hash",
        "users",
        ["refresh_token_hash"],
    )


def downgrade() -> None:
    op.drop_index("idx_users_refresh_token_hash", table_name="users")
    op.drop_column("users", "refresh_token_hash")
