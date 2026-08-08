"""Add metadata JSONB column to sms_logs and extend status check constraint.

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-29

Changes:
  sms_logs table:
    + metadata  JSONB nullable, server_default '{}'
        Stores auxiliary data for the SMS reply-confirm flow:
          {"confirmation_token": "1234", "appointment_id": "<uuid>"}
        NULL-safe: older rows remain NULL until a reminder is re-queued.

  sms_logs.status check constraint:
    - Drop existing sms_logs_status_check (allows queued|sent|failed|delivered)
    + Recreate to also allow 'replied' (set when patient confirms via SMS reply)

Rationale:
  The appointment confirmation-via-SMS-reply feature (Step 3 of the inbound
  webhook flow) marks a matching sms_log row as 'replied' after the patient
  sends "CONFIRM <token>".  The metadata column stores the token and the
  appointment_id so the webhook handler can look up the right row without
  a full-table scan.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None

_OLD_CONSTRAINT = "sms_logs_status_check"
_NEW_CONSTRAINT = "sms_logs_status_check"
_OLD_CHECK = "status IN ('queued', 'sent', 'failed', 'delivered')"
_NEW_CHECK = "status IN ('queued', 'sent', 'failed', 'delivered', 'replied')"


def upgrade() -> None:
    # 1. Add metadata JSONB column (nullable, default empty object).
    op.add_column(
        "sms_logs",
        sa.Column(
            "metadata",
            JSONB,
            nullable=True,
            server_default="{}",
        ),
    )

    # 2. Replace the status check constraint to include 'replied'.
    op.drop_constraint(_OLD_CONSTRAINT, "sms_logs", type_="check")
    op.create_check_constraint(_NEW_CONSTRAINT, "sms_logs", _NEW_CHECK)


def downgrade() -> None:
    # Restore the original status constraint (remove 'replied').
    op.drop_constraint(_NEW_CONSTRAINT, "sms_logs", type_="check")
    op.create_check_constraint(_OLD_CONSTRAINT, "sms_logs", _OLD_CHECK)

    # Remove the metadata column.
    op.drop_column("sms_logs", "metadata")
