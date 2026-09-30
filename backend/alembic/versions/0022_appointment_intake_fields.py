"""Add appointment intake fields and link intake tokens to appointments.

Adds:
  - appointments.intake_completed  (boolean, NOT NULL, default false)
  - appointments.intake_submitted_at (timestamptz, nullable)
  - patient_intake_tokens.appointment_id (uuid FK → appointments, nullable)

Revision ID: 0022
Revises: 5c3c523b3fc1
Create Date: 2026-08-28
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "0022"
down_revision: str | None = "5c3c523b3fc1"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    # --- appointments: new intake tracking columns ---
    op.add_column(
        "appointments",
        sa.Column(
            "intake_completed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "appointments",
        sa.Column("intake_submitted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- patient_intake_tokens: link to appointment ---
    op.add_column(
        "patient_intake_tokens",
        sa.Column(
            "appointment_id",
            UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_intake_tokens_appointment_id_appointments",
        "patient_intake_tokens",
        "appointments",
        ["appointment_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_intake_tokens_appointment",
        "patient_intake_tokens",
        ["appointment_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_intake_tokens_appointment", table_name="patient_intake_tokens")
    op.drop_constraint(
        "fk_intake_tokens_appointment_id_appointments",
        "patient_intake_tokens",
        type_="foreignkey",
    )
    op.drop_column("patient_intake_tokens", "appointment_id")
    op.drop_column("appointments", "intake_submitted_at")
    op.drop_column("appointments", "intake_completed")
