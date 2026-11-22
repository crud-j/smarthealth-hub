"""Keep when, who and why a patient was deactivated (Inactive Patients page).

Deactivating a patient only ever set ``is_active = FALSE``; nothing is
deleted. These columns let the new Inactive Patients page show when, by whom
and why, and are cleared again on Reactivate (the audit log keeps the history).

Patients already inactive get ``deactivated_at`` / ``deactivated_by`` from
their latest old-style ``DELETE`` audit row, when there is one. The reason
was never recorded before, so it stays empty for them. ``audit_logs`` is only
read here, never changed.

Revision ID: 0032
Revises: 0031
Create Date: 2026-11-22
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column("deactivated_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "patients",
        sa.Column(
            "deactivated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_patients_deactivated_by_users", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("patients", sa.Column("deactivation_reason", sa.Text(), nullable=True))

    op.execute(
        """
        UPDATE patients AS p
           SET deactivated_at = d.created_at,
               deactivated_by = (SELECT u.id FROM users AS u WHERE u.id = d.user_id)
          FROM (
                SELECT DISTINCT ON (entity_id) entity_id, created_at, user_id
                  FROM audit_logs
                 WHERE entity_type = 'patient' AND action = 'DELETE'
                 ORDER BY entity_id, created_at DESC
               ) AS d
         WHERE p.id = d.entity_id
           AND p.is_active = FALSE
           AND p.deactivated_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("patients", "deactivation_reason")
    op.drop_column("patients", "deactivated_by")
    op.drop_column("patients", "deactivated_at")
