"""Add intake_applications table and patient archive columns.

Revision ID: 0027
Revises: 0026
Create Date: 2026-09-06

Changes
-------
1. Create ``intake_applications`` table — stores public self-registration
   applications submitted via the open /register page, independent of the
   appointment-linked pre-visit intake token flow.

2. Add ``archived_at``, ``archived_by``, ``archive_reason`` columns to
   ``patients`` — soft-archive flag (distinct from is_active deactivation).
   Archived patients are hidden from default list/search but all clinical
   records are preserved.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from alembic import op

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    # ── 1. intake_applications table ─────────────────────────────────────────
    op.create_table(
        "intake_applications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        # Reference number shown to applicant on confirmation page
        sa.Column("reference_number", sa.String(20), nullable=False, unique=True),
        # Status lifecycle: pending → approved | rejected
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        # Full form data stored as JSONB so the schema stays flexible
        sa.Column("form_data", JSONB, nullable=False),
        # Medical background (basic — plain text, not AES-encrypted at this stage
        # because the applicant is not yet a patient)
        sa.Column("known_allergies", sa.Text, nullable=True),
        sa.Column("current_medications", sa.Text, nullable=True),
        sa.Column("pre_existing_conditions", sa.Text, nullable=True),
        # Review fields
        sa.Column("reviewed_by_id", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", name="fk_intake_applications_reviewed_by_users", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("reviewed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text, nullable=True),
        # FK to the created patient record (set when approved)
        sa.Column("patient_id", UUID(as_uuid=True),
                  sa.ForeignKey("patients.id", name="fk_intake_applications_patient_id_patients", ondelete="SET NULL"),
                  nullable=True),
        # Submitter IP for audit trail
        sa.Column("submitted_ip", sa.String(45), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_intake_applications_status", "intake_applications", ["status"])
    op.create_index("idx_intake_applications_created_at", "intake_applications", ["created_at"])
    op.create_index("idx_intake_applications_reference_number", "intake_applications", ["reference_number"], unique=True)

    # ── 2. Patient archive columns ────────────────────────────────────────────
    op.add_column(
        "patients",
        sa.Column("archived_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "patients",
        sa.Column(
            "archived_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_patients_archived_by_users", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "patients",
        sa.Column("archive_reason", sa.Text, nullable=True),
    )
    op.create_index("idx_patients_archived_at", "patients", ["archived_at"])


def downgrade() -> None:
    op.drop_index("idx_patients_archived_at", table_name="patients")
    op.drop_column("patients", "archive_reason")
    op.drop_column("patients", "archived_by")
    op.drop_column("patients", "archived_at")

    op.drop_index("idx_intake_applications_reference_number", table_name="intake_applications")
    op.drop_index("idx_intake_applications_created_at", table_name="intake_applications")
    op.drop_index("idx_intake_applications_status", table_name="intake_applications")
    op.drop_table("intake_applications")
