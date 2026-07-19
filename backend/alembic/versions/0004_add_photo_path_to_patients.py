"""Add photo_path column to patients table.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-19

Changes:
  patients table:
    + photo_path VARCHAR(512) NULL
      Stores the server-relative path to the patient's profile photo JPEG,
      e.g. "patient_photos/3fa85f64-5717-4562-b3fc-2c963f66afa6.jpg".
      NULL means no photo has been uploaded yet.
      Rendered as a base64 data URI inside WeasyPrint health-card PDFs.

Security note:
  photo_path stores a filesystem path, not PHI.  However, access to the
  photo endpoint is still gated behind JWT auth + RBAC so that an
  unauthenticated caller cannot enumerate patient face images.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# ---------------------------------------------------------------------------
# Alembic revision identifiers
# ---------------------------------------------------------------------------

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column(
            "photo_path",
            sa.String(512),
            nullable=True,
            comment=(
                "Relative path inside backend/media/ for the patient profile photo. "
                "NULL = no photo uploaded."
            ),
        ),
    )


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------


def downgrade() -> None:
    op.drop_column("patients", "photo_path")
