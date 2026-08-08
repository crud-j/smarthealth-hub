"""Fix health_cards unique constraint: allow multiple card rows per patient.

Revision ID: 0018
Revises: 0017
Create Date: 2026-07-31

Problem (bug):
  The initial schema placed a UNIQUE constraint on health_cards.patient_id,
  enforcing one card row per patient across ALL statuses.  The reissue flow
  (card_generation_service.reissue_card) marks the old card 'reissued' and
  inserts a NEW row for the same patient_id — which PostgreSQL rejects with
  UniqueViolationError.  This makes card reissue impossible and causes any
  request that triggers reissue to return HTTP 500.

Fix:
  1. Drop the erroneous UNIQUE constraint on patient_id.
  2. Add a UNIQUE(patient_id, card_version) constraint so the combination
     of patient + version is unique (same patient can have v1, v2, v3…
     across reissues, but not two v1 cards for the same patient).
  3. The business rule "only one ACTIVE card per patient" is enforced by the
     service layer (card_generation_service.generate_card idempotency check),
     not by a DB unique constraint.

Migration is safe to run against existing data: existing rows all have
card_version=1 (first and only card per patient), so the new composite
unique constraint is satisfied by the existing data.

The existing idx_cards_patient index is kept for query performance on
common lookups by patient_id.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Step 1: Drop the UNIQUE constraint on health_cards.patient_id.
    #
    # The SQLAlchemy ORM named this constraint "uq_health_cards_patient_id"
    # (confirmed via pg_constraint inspection of the live database).
    # Drop it so that a patient can have more than one card row (needed
    # for the reissue flow: old row kept as 'reissued', new row inserted).
    # ------------------------------------------------------------------
    op.drop_constraint(
        "uq_health_cards_patient_id",
        "health_cards",
        type_="unique",
    )

    # ------------------------------------------------------------------
    # Step 2: Add a composite UNIQUE(patient_id, card_version) constraint.
    #
    # This ensures the same patient cannot have two cards with the same
    # version number, while allowing multiple rows per patient across
    # different reissue generations (v1, v2, v3, …).
    # ------------------------------------------------------------------
    op.create_unique_constraint(
        "uq_health_cards_patient_version",
        "health_cards",
        ["patient_id", "card_version"],
    )


def downgrade() -> None:
    # Remove the composite constraint.
    op.drop_constraint(
        "uq_health_cards_patient_version",
        "health_cards",
        type_="unique",
    )

    # Restore the original (buggy) single-column unique constraint.
    # Note: downgrade will fail if a patient has more than one card row
    # (i.e. if any reissues were performed after this migration was applied).
    op.create_unique_constraint(
        "uq_health_cards_patient_id",
        "health_cards",
        ["patient_id"],
    )
