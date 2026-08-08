"""Add blood_type column to patients table.

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-28

Changes:
  + patients.blood_type  VARCHAR(5) nullable — ABO/Rh blood group
      Allowed values: 'A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'
      NULL means blood type was not recorded at registration time.

A CHECK constraint enforces the allowed set at the DB layer, matching the
Pydantic Literal validator in PatientCreate / PatientUpdate schemas.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None

_VALID_BLOOD_TYPES = "blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown') OR blood_type IS NULL"
_CONSTRAINT_NAME = "patients_blood_type_check"


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column("blood_type", sa.String(5), nullable=True),
    )
    op.create_check_constraint(
        _CONSTRAINT_NAME,
        "patients",
        _VALID_BLOOD_TYPES,
    )


def downgrade() -> None:
    op.drop_constraint(_CONSTRAINT_NAME, "patients", type_="check")
    op.drop_column("patients", "blood_type")
