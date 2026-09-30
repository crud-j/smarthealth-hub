"""Placeholder — migration 0009 was not used during development.

This migration exists solely to maintain a contiguous revision chain
for audit tooling. It performs no schema changes.

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-01
"""
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass  # No schema changes — placeholder only


def downgrade() -> None:
    pass  # No schema changes — placeholder only
