"""Create medical_history table (SDP Section 4.2).

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-18

Changes:
  + medical_history table with columns:
      id UUID PRIMARY KEY
      patient_id UUID NOT NULL FK → patients(id) ON DELETE CASCADE
      condition_name VARCHAR(150) NOT NULL
      notes TEXT  (AES-256-GCM encrypted at the application layer)
      severity VARCHAR(20) CHECK IN ('mild', 'moderate', 'severe')
      diagnosed_date DATE
      recorded_by UUID FK → users(id)
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()

  + index: idx_medhist_patient ON medical_history(patient_id)

Note: The ``notes`` column is a plain TEXT column at the database level.
Encryption is enforced strictly at the application layer (AES-256-GCM via
app/utils/encryption.py) — this migration intentionally does NOT use
pgcrypto or column-level encryption to keep the schema portable.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# ---------------------------------------------------------------------------
# Alembic revision identifiers
# ---------------------------------------------------------------------------
revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------


def upgrade() -> None:
    op.create_table(
        "medical_history",
        sa.Column(
            "id",
            PG_UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
            comment="Primary key — randomly generated UUID",
        ),
        sa.Column(
            "patient_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey(
                "patients.id",
                name="fk_medical_history_patient_id_patients",
                ondelete="CASCADE",
            ),
            nullable=False,
            comment="FK → patients.id; cascade-deletes when patient is removed",
        ),
        sa.Column(
            "condition_name",
            sa.String(150),
            nullable=False,
            comment="Human-readable condition/diagnosis name, e.g. 'Type 2 Diabetes'",
        ),
        sa.Column(
            "notes",
            sa.Text,
            nullable=True,
            comment=(
                "Clinical notes — stored as AES-256-GCM ciphertext "
                "(application-layer encryption via app/utils/encryption.py). "
                "Never read/write without going through encrypt_text/decrypt_text."
            ),
        ),
        sa.Column(
            "severity",
            sa.String(20),
            nullable=True,
            comment="Condition severity: 'mild', 'moderate', or 'severe'",
        ),
        sa.Column(
            "diagnosed_date",
            sa.Date,
            nullable=True,
            comment="Date the condition was first clinically diagnosed",
        ),
        sa.Column(
            "recorded_by",
            PG_UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                name="fk_medical_history_recorded_by_users",
            ),
            nullable=True,
            comment="FK → users.id; the staff member who entered this record",
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
            comment="Row creation timestamp (UTC)",
        ),
    )

    # Severity CHECK constraint
    op.create_check_constraint(
        "medical_history_severity_check",
        "medical_history",
        "severity IN ('mild', 'moderate', 'severe')",
    )

    # Index on patient_id — all list queries filter by this column
    op.create_index(
        "idx_medhist_patient",
        "medical_history",
        ["patient_id"],
    )


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------


def downgrade() -> None:
    op.drop_index("idx_medhist_patient", table_name="medical_history")
    op.drop_constraint(
        "medical_history_severity_check", "medical_history", type_="check"
    )
    op.drop_table("medical_history")
