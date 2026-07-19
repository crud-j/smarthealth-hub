"""Add analytics performance indexes.

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-19

Changes:
  medical_history table:
    + idx_medhist_created_at ON medical_history(created_at)
      Speeds up the illness-trends query that filters by created_at range.

    + idx_medhist_condition ON medical_history(condition_name)
      Speeds up GROUP BY condition_name aggregations in the illness-trends
      endpoint.

  visits table:
    + idx_visits_type ON visits(visit_type)
      Supports future GROUP BY visit_type aggregations in reporting.

Rationale:
  The Phase 5 analytics illness-trends endpoint performs:
    SELECT condition_name, date_trunc(..., created_at), COUNT(*)
    FROM medical_history
    WHERE created_at BETWEEN :from AND :to
    GROUP BY 1, 2
  Without an index on created_at, this is a full-table scan on every request.
  A composite index (created_at, condition_name) is not used here because
  condition_name has high cardinality and PostgreSQL's planner prefers a
  separate index per column for flexible query plan selection.

  All other analytics indexes (immunizations.next_due_date,
  appointments.scheduled_at, appointments.status, visits.visit_date) were
  already created in migration 0001.
"""

from __future__ import annotations

from alembic import op

# ---------------------------------------------------------------------------
# Alembic revision identifiers
# ---------------------------------------------------------------------------

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------


def upgrade() -> None:
    # Index on medical_history.created_at for date-range filtering in
    # the illness-trends aggregation query.
    op.create_index(
        "idx_medhist_created_at",
        "medical_history",
        ["created_at"],
        unique=False,
    )

    # Index on medical_history.condition_name for GROUP BY efficiency.
    op.create_index(
        "idx_medhist_condition",
        "medical_history",
        ["condition_name"],
        unique=False,
    )

    # Index on visits.visit_type for future reporting aggregations.
    op.create_index(
        "idx_visits_type",
        "visits",
        ["visit_type"],
        unique=False,
    )


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------


def downgrade() -> None:
    op.drop_index("idx_visits_type", table_name="visits")
    op.drop_index("idx_medhist_condition", table_name="medical_history")
    op.drop_index("idx_medhist_created_at", table_name="medical_history")
