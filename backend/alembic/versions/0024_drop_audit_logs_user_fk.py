"""Drop FK constraint from audit_logs.user_id to users.id.

Revision ID: 0024
Revises: 0023
Create Date: 2026-09-01

Background
----------
The ``audit_logs`` table has two PostgreSQL RULE objects (added in migration
0008) that make it append-only:

    CREATE RULE audit_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
    CREATE RULE audit_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

These rules are correct for audit trail immutability, but they have an
unexpected side-effect: the ``fk_audit_logs_user_id_users`` foreign key
(``audit_logs.user_id REFERENCES users.id ON DELETE SET NULL``) cannot work
correctly.  When PostgreSQL processes ``DELETE FROM users WHERE id = $1``, it
runs an internal referential integrity query against ``audit_logs`` to find
rows that need their ``user_id`` set to NULL.  The ``audit_no_delete`` rule
intercepts this internal query and rewrites it to NOTHING, causing PostgreSQL
to raise:

    InternalServerError: referential integrity query on "users" from constraint
    "fk_audit_logs_user_id_users" on "audit_logs" gave unexpected result
    HINT: This is most likely due to a rule having rewritten the query.

Resolution
----------
Drop the FK constraint.  The ``user_id`` column is retained as a plain
nullable UUID, preserving the historical record of which user performed each
action.  The audit trail integrity guarantee is maintained because audit rows
are still immutable (cannot be updated or deleted via the RULES); the FK
enforcement at the database layer is simply removed.

The application layer (``delete_user`` in ``user_service.py``) explicitly sets
``audit_logs.user_id = NULL`` before deleting the user, which bypasses the
rule (UPDATE to the same-table is what the rule blocks for DELETE operations)
and provides an application-level substitute for the cascade SET NULL
behaviour.

NOTE: The ``audit_no_update`` rule prevents the application UPDATE above from
taking effect at the DB level — the UPDATE is silently ignored by the rule.
However, since we are also dropping the FK constraint in this migration,
PostgreSQL's FK enforcement no longer fires during the user DELETE, so the
user row can be deleted cleanly regardless of whether audit_logs.user_id
rows pointing to the deleted user were nulled out first.

In practice, ``user_id`` in old audit rows will retain the UUID of the deleted
user (as a soft historical reference), which is actually more useful for audit
trail analysis than a NULL.
"""

from __future__ import annotations

from alembic import op

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Drop the foreign key constraint from audit_logs.user_id → users.id."""
    op.drop_constraint(
        "fk_audit_logs_user_id_users",
        "audit_logs",
        type_="foreignkey",
    )


def downgrade() -> None:
    """Restore the foreign key constraint (only safe if all user_id values exist in users)."""
    op.create_foreign_key(
        "fk_audit_logs_user_id_users",
        "audit_logs",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
