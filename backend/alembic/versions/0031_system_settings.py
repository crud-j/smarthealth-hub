"""Admin-editable system settings (clinic name, reminder lead times, SMS templates).

One row per setting an admin has changed on the System Configuration page.
No rows are inserted: until an admin saves something, every value comes from
the same place as before (.env / built-in templates), so this migration does
not change behaviour.

updated_by keeps who made the last change; it is set to NULL if that staff
account is deleted (the audit log keeps the full history).

Revision ID: 0031
Revises: 0030
Create Date: 2026-11-20
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(length=100), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                name="fk_system_settings_updated_by_users",
                ondelete="SET NULL",
            ),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("system_settings")
