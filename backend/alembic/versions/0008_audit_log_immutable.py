"""Add PostgreSQL rules to make audit_logs table append-only (immutable).

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-20

Changes:
  audit_logs table:
    + RULE audit_no_update — any UPDATE on audit_logs is silently ignored
      (DO INSTEAD NOTHING).  This protects the compliance trail from
      accidental or malicious modification at the DB level, even if the
      application layer has a bug.

    + RULE audit_no_delete — any DELETE on audit_logs is silently ignored.
      Audit rows can only be removed by a superuser with DROP RULE + DELETE,
      which requires direct DB access.

Design note:
  PostgreSQL RULE-based blocking is simpler than a trigger for pure
  blocking because:
    a) The DO INSTEAD NOTHING clause makes the operation a no-op rather than
       raising an exception — this is intentional: it prevents error
       propagation in code paths that might inadvertently attempt a cleanup
       DELETE (e.g. a test teardown that does DELETE FROM audit_logs WHERE ...).
    b) Rules fire before triggers and require no separate function definition.

  If stricter enforcement (raise an error to the caller) is needed in a
  future iteration, replace with a BEFORE UPDATE/DELETE trigger that does
  RAISE EXCEPTION.
"""

from __future__ import annotations

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE RULE audit_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;"
    )
    op.execute(
        "CREATE RULE audit_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;"
    )


def downgrade() -> None:
    op.execute("DROP RULE IF EXISTS audit_no_update ON audit_logs;")
    op.execute("DROP RULE IF EXISTS audit_no_delete ON audit_logs;")
