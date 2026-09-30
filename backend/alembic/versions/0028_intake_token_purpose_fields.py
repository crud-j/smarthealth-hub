"""Add visit_purpose and purpose_details columns to patient_intake_tokens.

Revision ID: 0028
Revises: 0027
Create Date: 2026-09-21
"""
from __future__ import annotations
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from alembic import op

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "patient_intake_tokens",
        sa.Column("visit_purpose", sa.String(200), nullable=True),
    )
    op.add_column(
        "patient_intake_tokens",
        sa.Column("purpose_details", JSONB, nullable=True),
    )
    op.create_index(
        "idx_intake_tokens_visit_purpose",
        "patient_intake_tokens",
        ["visit_purpose"],
    )


def downgrade() -> None:
    op.drop_index("idx_intake_tokens_visit_purpose", table_name="patient_intake_tokens")
    op.drop_column("patient_intake_tokens", "purpose_details")
    op.drop_column("patient_intake_tokens", "visit_purpose")
