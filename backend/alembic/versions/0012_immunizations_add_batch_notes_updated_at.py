"""Add batch_number, notes, updated_at columns to immunizations table.

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-25

Changes:
  + immunizations.batch_number  VARCHAR(50) nullable — vaccine lot/batch number
  + immunizations.notes         TEXT nullable        — free-text clinical notes
  + immunizations.updated_at    TIMESTAMPTZ NOT NULL default now() — last update time

These columns are required for the full immunization CRUD implementation
introduced in the immunization service and endpoints.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column(
        "immunizations",
        sa.Column("batch_number", sa.String(50), nullable=True),
    )
    op.add_column(
        "immunizations",
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.add_column(
        "immunizations",
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_column("immunizations", "updated_at")
    op.drop_column("immunizations", "notes")
    op.drop_column("immunizations", "batch_number")
