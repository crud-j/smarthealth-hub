"""Add patients.house_street (house no. / street / landmark).

Registration's "Home Address / Landmark" text was thrown away whenever
barangay / municipality / province were filled in: the composed address kept
only the structured parts.  This column keeps it, and the composed address now
starts with it (patient_service.compose_address).

Backfill: patients created by approving a public intake application still have
the original text in ``intake_applications.form_data->>'house_street'``.  Copy
it over and rebuild their address with the same rule as compose_address
(house/street, sitio, barangay, municipality, province; blanks skipped).
Staff-registered patients' text was never stored and cannot be recovered.

Re-running the backfill is harmless: it only fills rows whose house_street is
still NULL.

Revision ID: 0029
Revises: 0028
Create Date: 2026-11-20
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column("house_street", sa.String(255), nullable=True),
    )

    # 1. Copy the intake applicant's house/street to the patient it created.
    op.execute(
        """
        UPDATE patients AS p
        SET house_street = left(btrim(ia.form_data->>'house_street'), 255)
        FROM intake_applications AS ia
        WHERE ia.patient_id = p.id
          AND p.house_street IS NULL
          AND coalesce(btrim(ia.form_data->>'house_street'), '') <> ''
        """
    )

    # 2. Rebuild those patients' address (compose_address: location parts win,
    #    house/street goes first).  concat_ws skips NULLs; nullif(btrim) drops blanks.
    op.execute(
        """
        UPDATE patients
        SET address = concat_ws(
            ', ',
            nullif(btrim(house_street), ''),
            nullif(btrim(sitio_purok), ''),
            nullif(btrim(barangay), ''),
            nullif(btrim(municipality), ''),
            nullif(btrim(province), '')
        )
        WHERE house_street IS NOT NULL
          AND coalesce(
            nullif(btrim(sitio_purok), ''),
            nullif(btrim(barangay), ''),
            nullif(btrim(municipality), ''),
            nullif(btrim(province), '')
          ) IS NOT NULL
        """
    )


def downgrade() -> None:
    # Backfilled addresses keep the house/street text, which is harmless:
    # without the column the address is plain free text again.
    op.drop_column("patients", "house_street")
