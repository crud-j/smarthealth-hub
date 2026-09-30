"""Make users.password_hash nullable to support passkey-only accounts.

When an admin creates a staff account with credential_mode='passkey', no
password is set.  The user authenticates exclusively via a registered
WebAuthn passkey credential (passkey_credentials table).  Password-based
login is blocked for such accounts in auth_service.py.

Revision ID: 0023
Revises: 0022
Create Date: 2026-09-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# ---------------------------------------------------------------------------
# Alembic revision identifiers
# ---------------------------------------------------------------------------

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | None = None
depends_on: str | None = None


# ---------------------------------------------------------------------------
# Migrations
# ---------------------------------------------------------------------------


def upgrade() -> None:
    """Allow NULL in users.password_hash (passkey-only accounts)."""
    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.Text(),
        nullable=True,
    )


def downgrade() -> None:
    """Restore NOT NULL on users.password_hash.

    WARNING: If any rows have NULL password_hash this will fail.
    Set a sentinel value first if needed:
        UPDATE users SET password_hash = '' WHERE password_hash IS NULL;
    """
    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.Text(),
        nullable=False,
    )
