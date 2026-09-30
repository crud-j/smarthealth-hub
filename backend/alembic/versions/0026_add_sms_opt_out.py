"""Add sms_opt_out and preferred_language columns to patients table.

Revision ID: 0026
Revises: 0025
Create Date: 2026-09-05

Background
----------
Adds two columns to ``patients``:

  sms_opt_out       BOOLEAN NOT NULL DEFAULT FALSE
    Patients who reply STOP to any reminder SMS are flagged here.
    The reminder scheduler reads this flag and skips opted-out patients,
    ensuring we do not send further SMS after a STOP reply.

  preferred_language  VARCHAR(5) NOT NULL DEFAULT 'en'
    Intended for future bilingual SMS template selection (English / Filipino).
    The scheduler currently sends 'en' templates only; this column is present
    so the feature can be wired up without a schema change.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic
revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column(
            "sms_opt_out",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("FALSE"),
        ),
    )
    op.add_column(
        "patients",
        sa.Column(
            "preferred_language",
            sa.String(5),
            nullable=False,
            server_default=sa.text("'en'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("patients", "preferred_language")
    op.drop_column("patients", "sms_opt_out")
