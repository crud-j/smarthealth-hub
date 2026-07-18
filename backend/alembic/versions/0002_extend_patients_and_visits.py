"""Extend patients and visits tables — RHU form alignment (Phase 2).

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-18

Changes:
  patients table:
    + philhealth_member_type VARCHAR(20) CHECK IN ('member','dependent')
      Captures the "PHILHEALTH MEMBER / DEPENDENTS" radio on the RHU form.

  visits table:
    + case_no VARCHAR(30) UNIQUE       — RHU form CASE NO. column
    + blood_pressure VARCHAR(20)       — e.g. "120/80 mmHg"
    + temperature NUMERIC(4,1)         — degrees Celsius
    + pulse_rate INT                   — beats per minute
    + respiratory_rate INT             — breaths per minute
    + oxygen_saturation INT            — SpO2 %
    + weight_kg NUMERIC(5,2)           — kilograms
    + height_cm NUMERIC(5,1)           — centimeters
    + past_medical_history TEXT        — separate from chief_complaint
    + present_medical_history TEXT     — separate from chief_complaint

  indexes:
    + idx_visits_case_no ON visits(case_no)
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# ---------------------------------------------------------------------------
# Alembic revision identifiers
# ---------------------------------------------------------------------------
revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------


def upgrade() -> None:
    # ── patients: add philhealth_member_type ─────────────────────────────
    op.add_column(
        "patients",
        sa.Column(
            "philhealth_member_type",
            sa.String(20),
            nullable=True,
            comment="RHU form: PHILHEALTH MEMBER/DEPENDENTS — 'member' or 'dependent'",
        ),
    )
    op.create_check_constraint(
        "patients_philhealth_member_type_check",
        "patients",
        "philhealth_member_type IN ('member', 'dependent')",
    )

    # ── visits: add case_no ───────────────────────────────────────────────
    op.add_column(
        "visits",
        sa.Column(
            "case_no",
            sa.String(30),
            nullable=True,
            comment="RHU form CASE NO. — auto-generated: BHC-VISIT-YYYY-NNNNNN",
        ),
    )
    # Unique constraint on case_no (NULL values are not considered equal in
    # PostgreSQL UNIQUE constraints, so existing NULL rows are safe).
    op.create_unique_constraint("uq_visits_case_no", "visits", ["case_no"])
    op.create_index("idx_visits_case_no", "visits", ["case_no"])

    # ── visits: vital signs columns ───────────────────────────────────────
    op.add_column(
        "visits",
        sa.Column(
            "blood_pressure",
            sa.String(20),
            nullable=True,
            comment="e.g. '120/80 mmHg' — from VITAL SIGNS on RHU form",
        ),
    )
    op.add_column(
        "visits",
        sa.Column(
            "temperature",
            sa.Numeric(4, 1),
            nullable=True,
            comment="Body temperature in degrees Celsius",
        ),
    )
    op.add_column(
        "visits",
        sa.Column(
            "pulse_rate",
            sa.Integer,
            nullable=True,
            comment="Heart rate in beats per minute",
        ),
    )
    op.add_column(
        "visits",
        sa.Column(
            "respiratory_rate",
            sa.Integer,
            nullable=True,
            comment="Respiratory rate in breaths per minute",
        ),
    )
    op.add_column(
        "visits",
        sa.Column(
            "oxygen_saturation",
            sa.Integer,
            nullable=True,
            comment="SpO2 percentage (0–100)",
        ),
    )
    op.add_column(
        "visits",
        sa.Column(
            "weight_kg",
            sa.Numeric(5, 2),
            nullable=True,
            comment="Patient weight in kilograms",
        ),
    )
    op.add_column(
        "visits",
        sa.Column(
            "height_cm",
            sa.Numeric(5, 1),
            nullable=True,
            comment="Patient height in centimeters",
        ),
    )

    # ── visits: history columns ───────────────────────────────────────────
    op.add_column(
        "visits",
        sa.Column(
            "past_medical_history",
            sa.Text,
            nullable=True,
            comment="Patient's prior conditions relevant to this visit — plaintext (not encrypted)",
        ),
    )
    op.add_column(
        "visits",
        sa.Column(
            "present_medical_history",
            sa.Text,
            nullable=True,
            comment="History of presenting illness — plaintext (not encrypted)",
        ),
    )


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------


def downgrade() -> None:
    # ── visits: remove history columns ───────────────────────────────────
    op.drop_column("visits", "present_medical_history")
    op.drop_column("visits", "past_medical_history")

    # ── visits: remove vital signs columns ───────────────────────────────
    op.drop_column("visits", "height_cm")
    op.drop_column("visits", "weight_kg")
    op.drop_column("visits", "oxygen_saturation")
    op.drop_column("visits", "respiratory_rate")
    op.drop_column("visits", "pulse_rate")
    op.drop_column("visits", "temperature")
    op.drop_column("visits", "blood_pressure")

    # ── visits: remove case_no ────────────────────────────────────────────
    op.drop_index("idx_visits_case_no", table_name="visits")
    op.drop_constraint("uq_visits_case_no", "visits", type_="unique")
    op.drop_column("visits", "case_no")

    # ── patients: remove philhealth_member_type ───────────────────────────
    op.drop_constraint(
        "patients_philhealth_member_type_check", "patients", type_="check"
    )
    op.drop_column("patients", "philhealth_member_type")
