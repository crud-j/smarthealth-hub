"""Create patient_intake_tokens table for pre-visit digital intake links.

Revision ID: 0021
Revises: 0020
Create Date: 2026-08-02
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from alembic import op

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "patient_intake_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("token", UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column(
            "created_by_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_intake_tokens_created_by_users", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("draft_data", JSONB, nullable=True),
        sa.Column(
            "patient_id",
            UUID(as_uuid=True),
            sa.ForeignKey("patients.id", name="fk_intake_tokens_patient_id_patients", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("idx_intake_tokens_token", "patient_intake_tokens", ["token"], unique=True)
    op.create_index("idx_intake_tokens_expires", "patient_intake_tokens", ["expires_at"])


def downgrade() -> None:
    op.drop_index("idx_intake_tokens_expires", table_name="patient_intake_tokens")
    op.drop_index("idx_intake_tokens_token", table_name="patient_intake_tokens")
    op.drop_table("patient_intake_tokens")
