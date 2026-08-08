"""Add structured registration fields to patients.

Revision ID: 0015
Revises: 0014
Create Date: 2026-07-31

This migration is additive and backward-compatible:
- Existing patients keep their legacy ``address`` values.
- New structured address fields are nullable so the form can be rolled out
  incrementally.
- Application-level consent is stored as a boolean + timestamp.
- Sensitive clinical free-text fields are stored in encrypted form by the
  service layer; the database keeps them as plain TEXT columns.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("household_number", sa.String(length=50), nullable=True))
    op.add_column("patients", sa.Column("sitio_purok", sa.String(length=150), nullable=True))
    op.add_column("patients", sa.Column("barangay", sa.String(length=150), nullable=True))
    op.add_column("patients", sa.Column("municipality", sa.String(length=150), nullable=True))
    op.add_column("patients", sa.Column("province", sa.String(length=150), nullable=True))
    op.add_column("patients", sa.Column("occupation", sa.String(length=150), nullable=True))
    op.add_column("patients", sa.Column("emergency_contact_name", sa.String(length=150), nullable=True))
    op.add_column("patients", sa.Column("emergency_contact_number", sa.String(length=20), nullable=True))
    op.add_column("patients", sa.Column("philhealth_category", sa.String(length=40), nullable=True))
    op.add_column("patients", sa.Column("is_4ps_beneficiary", sa.Boolean(), server_default=sa.text("FALSE"), nullable=False))
    op.add_column("patients", sa.Column("household_id_4ps", sa.String(length=80), nullable=True))
    op.add_column("patients", sa.Column("is_indigenous", sa.Boolean(), server_default=sa.text("FALSE"), nullable=False))
    op.add_column("patients", sa.Column("place_of_birth", sa.String(length=150), nullable=True))
    op.add_column("patients", sa.Column("mothers_maiden_name", sa.String(length=150), nullable=True))
    op.add_column("patients", sa.Column("senior_id_number", sa.String(length=80), nullable=True))
    op.add_column("patients", sa.Column("pwd_id_number", sa.String(length=80), nullable=True))
    op.add_column("patients", sa.Column("last_menstrual_period", sa.Date(), nullable=True))
    op.add_column("patients", sa.Column("gravida", sa.Integer(), nullable=True))
    op.add_column("patients", sa.Column("para", sa.Integer(), nullable=True))
    op.add_column("patients", sa.Column("estimated_due_date", sa.Date(), nullable=True))
    op.add_column("patients", sa.Column("height_cm", sa.Numeric(5, 1), nullable=True))
    op.add_column("patients", sa.Column("weight_kg", sa.Numeric(5, 2), nullable=True))
    op.add_column("patients", sa.Column("allergies", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("known_conditions", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("registration_source", sa.String(length=20), nullable=True))
    op.add_column("patients", sa.Column("data_privacy_consent", sa.Boolean(), server_default=sa.text("FALSE"), nullable=False))
    op.add_column("patients", sa.Column("data_privacy_consent_at", sa.DateTime(timezone=True), nullable=True))

    op.create_check_constraint(
        "patients_philhealth_category_check",
        "patients",
        "philhealth_category IN ('indigent', 'sponsored', 'formal_economy', 'informal_economy', 'lifetime_member') OR philhealth_category IS NULL",
    )
    op.create_check_constraint(
        "patients_registration_source_check",
        "patients",
        "registration_source IN ('walk_in', 'referral', 'outreach', 'others') OR registration_source IS NULL",
    )

    op.create_index("idx_patients_philhealth_no", "patients", ["philhealth_no"], unique=False)
    op.create_index("idx_patients_household_number", "patients", ["household_number"], unique=False)
    op.create_index("idx_patients_barangay", "patients", ["barangay"], unique=False)
    op.create_index("idx_patients_municipality", "patients", ["municipality"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_patients_municipality", table_name="patients")
    op.drop_index("idx_patients_barangay", table_name="patients")
    op.drop_index("idx_patients_household_number", table_name="patients")
    op.drop_index("idx_patients_philhealth_no", table_name="patients")

    op.drop_constraint("patients_registration_source_check", "patients", type_="check")
    op.drop_constraint("patients_philhealth_category_check", "patients", type_="check")

    op.drop_column("patients", "data_privacy_consent_at")
    op.drop_column("patients", "data_privacy_consent")
    op.drop_column("patients", "registration_source")
    op.drop_column("patients", "known_conditions")
    op.drop_column("patients", "allergies")
    op.drop_column("patients", "weight_kg")
    op.drop_column("patients", "height_cm")
    op.drop_column("patients", "estimated_due_date")
    op.drop_column("patients", "para")
    op.drop_column("patients", "gravida")
    op.drop_column("patients", "last_menstrual_period")
    op.drop_column("patients", "pwd_id_number")
    op.drop_column("patients", "senior_id_number")
    op.drop_column("patients", "mothers_maiden_name")
    op.drop_column("patients", "place_of_birth")
    op.drop_column("patients", "is_indigenous")
    op.drop_column("patients", "household_id_4ps")
    op.drop_column("patients", "is_4ps_beneficiary")
    op.drop_column("patients", "philhealth_category")
    op.drop_column("patients", "emergency_contact_number")
    op.drop_column("patients", "emergency_contact_name")
    op.drop_column("patients", "occupation")
    op.drop_column("patients", "province")
    op.drop_column("patients", "municipality")
    op.drop_column("patients", "barangay")
    op.drop_column("patients", "sitio_purok")
    op.drop_column("patients", "household_number")
