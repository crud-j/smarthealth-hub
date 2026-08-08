"""Add extended patient registration fields (structured address, demographics,
clinical baseline, social programs, data privacy consent).

Revision ID: 0016
Revises: 0015
Create Date: 2026-07-31

NOTE: The columns enumerated here were introduced by migration 0015
(0015_add_patient_registration_fields.py).  This migration exists as the
authoritative named artifact for the "patient extended fields" feature set
requested in the thesis system upgrade.  Because Alembic tracks applied
revisions via the alembic_version table, this migration performs a no-op
upgrade (all columns were already added by 0015) while providing a clear,
human-readable checkpoint for the feature.

New DB columns covered by this revision chain (added in 0015):
  Demographics:
    place_of_birth          VARCHAR(150),  nullable
    occupation              VARCHAR(150),  nullable
    mothers_maiden_name     VARCHAR(150),  nullable
    household_number        VARCHAR(50),   nullable, indexed
    registration_source     VARCHAR(20),   nullable  (walk_in/referral/outreach/others)
    data_privacy_consent    BOOLEAN,       not null, default FALSE
    data_privacy_consent_at TIMESTAMPTZ,   nullable

  Structured Address:
    sitio_purok             VARCHAR(150),  nullable
    barangay                VARCHAR(150),  nullable, indexed
    municipality            VARCHAR(150),  nullable, indexed
    province                VARCHAR(150),  nullable

  Emergency Contact:
    emergency_contact_name   VARCHAR(150), nullable
    emergency_contact_number VARCHAR(20),  nullable

  Special IDs:
    senior_id_number         VARCHAR(80),  nullable
    pwd_id_number            VARCHAR(80),  nullable

  Social Programs:
    is_4ps_beneficiary       BOOLEAN,      not null, default FALSE
    household_id_4ps         VARCHAR(80),  nullable
    is_indigenous            BOOLEAN,      not null, default FALSE

  Clinical (encrypted at application layer with AES-256-GCM):
    allergies                TEXT,         nullable
    known_conditions         TEXT,         nullable

  PhilHealth extension:
    philhealth_category      VARCHAR(40),  nullable
      check: indigent|sponsored|formal_economy|informal_economy|lifetime_member

  Pregnancy details (conditional on is_pregnant):
    last_menstrual_period    DATE,         nullable
    gravida                  INTEGER,      nullable
    para                     INTEGER,      nullable
    estimated_due_date       DATE,         nullable

  Vitals baseline:
    height_cm                NUMERIC(5,1), nullable
    weight_kg                NUMERIC(5,2), nullable
"""

from __future__ import annotations

from alembic import op  # noqa: F401

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    # All columns were already applied in migration 0015.
    # This revision serves as the named feature checkpoint.
    pass


def downgrade() -> None:
    # No-op: reverting these columns is handled by migration 0015's downgrade.
    # To fully revert the extended patient fields, run:
    #   alembic downgrade 0014
    pass
