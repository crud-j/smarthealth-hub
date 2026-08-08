"""Widen patients.blood_type from VARCHAR(5) to VARCHAR(10).

Revision ID: 0017
Revises: 0016
Create Date: 2026-07-31

Root cause: migration 0013 declared blood_type as VARCHAR(5), but the allowed
value 'Unknown' is 7 characters. This caused StringDataRightTruncationError
on patient creation when blood_type was not specified and defaulted to 'Unknown'.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None

_CONSTRAINT_NAME = "patients_blood_type_check"
_CHECK_EXPR = "blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown') OR blood_type IS NULL"


def upgrade() -> None:
    # Drop the check constraint before altering the column type (required by PG).
    op.drop_constraint(_CONSTRAINT_NAME, "patients", type_="check")
    op.alter_column(
        "patients",
        "blood_type",
        type_=sa.String(10),
        existing_type=sa.String(5),
        existing_nullable=True,
    )
    op.create_check_constraint(_CONSTRAINT_NAME, "patients", _CHECK_EXPR)


def downgrade() -> None:
    op.drop_constraint(_CONSTRAINT_NAME, "patients", type_="check")
    op.alter_column(
        "patients",
        "blood_type",
        type_=sa.String(5),
        existing_type=sa.String(10),
        existing_nullable=True,
    )
    op.create_check_constraint(_CONSTRAINT_NAME, "patients", _CHECK_EXPR)
