"""add_health_card_generation_status

Adds generation_status and pdf_url columns to health_cards to support
async Celery-based PDF generation without blocking a uvicorn worker.

Revision ID: 5c3c523b3fc1
Revises: 0021
Create Date: 2026-08-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "5c3c523b3fc1"
down_revision: str | None = "0021"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column(
        "health_cards",
        sa.Column(
            "generation_status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "health_cards",
        sa.Column("pdf_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("health_cards", "pdf_url")
    op.drop_column("health_cards", "generation_status")
