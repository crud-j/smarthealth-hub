"""Add pg_trgm extension and trigram indexes for patient name search.

Revision ID: 0025
Revises: 0024
Create Date: 2026-09-05

Background
----------
The patient search query in ``patient_service.list_patients`` uses ILIKE
against ``patients.last_name`` and ``patients.first_name``.  As the patient
roster grows, these sequential scans become a bottleneck.

GIN trigram indexes (via the ``pg_trgm`` extension) allow PostgreSQL to use
an index for ILIKE / similarity searches, reducing search latency from O(n)
to O(log n + k) for typical name-prefix and substring queries.

A standard B-tree index on ``visits.visit_type`` is also added here to
accelerate analytics and appointment queries that filter or group by visit
type.

Implementation notes
--------------------
- ``CREATE INDEX CONCURRENTLY`` is intentionally NOT used because Alembic
  runs DDL inside an implicit transaction and PostgreSQL forbids CONCURRENTLY
  inside a transaction block.  ``IF NOT EXISTS`` is used instead for
  idempotency (safe to re-run if the migration was partially applied).
- The ``pg_trgm`` extension is created with ``IF NOT EXISTS`` so it is a
  no-op on databases that already have it enabled.
"""

from __future__ import annotations

from alembic import op

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Enable pg_trgm and create GIN trigram indexes for patient name search."""
    # Enable the trigram extension (no-op if already present)
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # GIN trigram index on patients.last_name — speeds up ILIKE '%term%' queries
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_patients_last_name_trgm "
        "ON patients USING gin (last_name gin_trgm_ops)"
    )

    # GIN trigram index on patients.first_name — speeds up ILIKE '%term%' queries
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_patients_first_name_trgm "
        "ON patients USING gin (first_name gin_trgm_ops)"
    )

    # Standard B-tree index on visits.visit_type — accelerates filter/group queries
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_visits_visit_type "
        "ON visits(visit_type)"
    )


def downgrade() -> None:
    """Drop the trigram indexes and optionally the pg_trgm extension."""
    op.execute("DROP INDEX IF EXISTS idx_visits_visit_type")
    op.execute("DROP INDEX IF EXISTS idx_patients_first_name_trgm")
    op.execute("DROP INDEX IF EXISTS idx_patients_last_name_trgm")
    # The extension is left in place on downgrade: dropping it would remove it
    # for any other objects that may rely on it (e.g. other indexes added
    # outside this migration).  Un-comment the line below only if you are
    # certain no other pg_trgm-dependent objects exist.
    # op.execute("DROP EXTENSION IF EXISTS pg_trgm")
