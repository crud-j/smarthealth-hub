"""Add missing indexes for Phase 4 appointment and SMS scheduler queries.

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-19

Changes:
  sms_logs table:
    + idx_sms_appointment ON sms_logs(appointment_id)
      Supports the scheduler NOT EXISTS subquery:
        SELECT 1 FROM sms_logs WHERE appointment_id = ? AND status IN (...)
      Without this index, each scheduler run does a full-table scan of
      sms_logs for every appointment in the window.

    + idx_sms_immunization ON sms_logs(immunization_id)
      Supports the immunization scheduler NOT EXISTS subquery:
        SELECT 1 FROM sms_logs WHERE immunization_id = ? AND status IN (...)

    + idx_sms_created_at ON sms_logs(created_at)
      Supports date range filters in GET /sms/logs and the immunization
      scheduler idempotency guard (DATE(created_at) = today).

    + idx_sms_provider_msg ON sms_logs(provider_message_id)
      Supports the webhook handler lookup:
        SELECT * FROM sms_logs WHERE provider_message_id = ?
      Without this index the delivery webhook does a full-table scan.

  appointments table:
    Note: idx_appt_patient, idx_appt_schedule, idx_appt_status were already
    created in migration 0001.  The composite index below is added to speed
    up the scheduler query which filters on BOTH scheduled_at AND status.

    + idx_appt_schedule_status ON appointments(scheduled_at, status)
      Supports the scheduler window query:
        WHERE scheduled_at BETWEEN ? AND ? AND status IN ('pending','confirmed')
      PostgreSQL can use this composite index to satisfy both predicates in
      a single index scan instead of combining two separate indexes.

Rationale:
  The Phase 4 scheduler runs hourly (appointment reminders) and daily
  (immunization reminders).  Without these indexes, each run performs
  full-table scans on sms_logs which grows unboundedly.  At 50 patients
  with weekly appointments the impact is low, but the indexes are cheap
  to add now and prevent performance degradation at scale.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    # ── sms_logs indexes ─────────────────────────────────────────────────────
    op.create_index(
        "idx_sms_appointment",
        "sms_logs",
        ["appointment_id"],
    )
    op.create_index(
        "idx_sms_immunization",
        "sms_logs",
        ["immunization_id"],
    )
    op.create_index(
        "idx_sms_created_at",
        "sms_logs",
        ["created_at"],
    )
    op.create_index(
        "idx_sms_provider_msg",
        "sms_logs",
        ["provider_message_id"],
    )

    # ── appointments composite index ─────────────────────────────────────────
    op.create_index(
        "idx_appt_schedule_status",
        "appointments",
        ["scheduled_at", "status"],
    )


def downgrade() -> None:
    op.drop_index("idx_appt_schedule_status", table_name="appointments")
    op.drop_index("idx_sms_provider_msg", table_name="sms_logs")
    op.drop_index("idx_sms_created_at", table_name="sms_logs")
    op.drop_index("idx_sms_immunization", table_name="sms_logs")
    op.drop_index("idx_sms_appointment", table_name="sms_logs")
