"""Add registration_data_source column to patients table.

Tracks whether a patient record was entered manually, via OCR autofill,
or via a pre-visit intake link.

Revision ID: 0020
Revises: 0019
Create Date: 2026-08-02
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column(
            "registration_data_source",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'manual'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("patients", "registration_data_source")
