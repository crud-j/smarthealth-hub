"""
Seed realistic intake test data into the REAL dev database.

Run from the backend/ directory:
    python -m tests.seed_intake_test_data

Requires:
  - Dev PostgreSQL running and DATABASE_URL set in backend/.env
  - Tables already created (run Alembic migrations first if needed)

What it inserts (idempotent — safe to re-run):
  3 PatientIntakeToken rows  → visible at /registrations > Pre-visit Drafts tab
  3 IntakeApplication rows   → visible at /settings/intake-applications and
                               /registrations > Online Applications tab

Intake form URLs (open in browser after running this script):
  Token 1 (full draft):  http://localhost:3000/intake/aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa
  Token 2 (partial):     http://localhost:3000/intake/bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb
  Token 3 (fresh):       http://localhost:3000/intake/cccccccc-3333-3333-3333-cccccccccccc
"""

from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

# ---------------------------------------------------------------------------
# Ensure backend/ is on sys.path so `app.*` imports resolve when running as
# `python -m tests.seed_intake_test_data` from the backend/ directory.
# ---------------------------------------------------------------------------
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.session import AsyncSessionLocal, engine
from app.models.intake_application import IntakeApplication
from app.models.intake_token import PatientIntakeToken

# ---------------------------------------------------------------------------
# Fixed UUIDs so re-runs produce the same rows (ON CONFLICT DO UPDATE).
# ---------------------------------------------------------------------------

TOKEN_1 = uuid.UUID("aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa")  # full draft
TOKEN_2 = uuid.UUID("bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb")  # partial draft
TOKEN_3 = uuid.UUID("cccccccc-3333-3333-3333-cccccccccccc")  # fresh, no draft

REF_1 = "REF-TEST-001"
REF_2 = "REF-TEST-002"
REF_3 = "REF-TEST-003"

# ---------------------------------------------------------------------------
# Draft data shapes — these mimic what the frontend intake form submits.
# The fields correspond to IntakeDraftPayload (PatientCreate-compatible).
# ---------------------------------------------------------------------------

_FULL_DRAFT = {
    "first_name": "Ana",
    "middle_name": "Dela Cruz",
    "last_name": "Villanueva",
    "birth_date": "1992-08-15",
    "sex": "female",
    "civil_status": "single",
    "mobile_number": "09171234567",
    "email": "ana.villanueva@example.com",
    "house_street": "123 Rosal St",
    "barangay": "Patubig",
    "municipality": "Marilao",
    "province": "Bulacan",
    "region": "III",
    "zip_code": "3013",
    "address": "123 Rosal St, Patubig, Marilao, Bulacan",
    "emergency_contact_name": "Juan Villanueva",
    "emergency_contact_relationship": "parent",
    "emergency_contact_number": "09271234567",
    "known_allergies": "Penicillin",
    "pre_existing_conditions": "Hypertension",
    "current_medications": "Amlodipine 5mg",
    "blood_type": "O+",
    "philhealth_id": "PH-1234567890",
    "is_pwd": False,
    "is_pregnant": False,
    "data_privacy_consent": True,
    "registration_source": "walk_in",
    "registration_data_source": "pre_visit",
    "visit_purpose": "general_checkup",
}

_PARTIAL_DRAFT = {
    "first_name": "Carlo",
    "last_name": "Mendoza",
    "birth_date": "2001-04-10",
    "sex": "male",
    "mobile_number": "09351111222",
    "barangay": "Patubig",
    "municipality": "Marilao",
    "province": "Bulacan",
    "address": "Patubig, Marilao, Bulacan",
    "is_pwd": False,
    "is_pregnant": False,
    "data_privacy_consent": True,
    "registration_source": "walk_in",
    "registration_data_source": "pre_visit",
    "visit_purpose": "immunization",
}


async def _seed_tokens(session: sa.ext.asyncio.AsyncSession) -> int:
    """
    Upsert three PatientIntakeToken rows.

    Uses raw INSERT ... ON CONFLICT (token) DO UPDATE so the script is
    idempotent — existing rows are refreshed with the current expires_at.
    """
    now = datetime.now(UTC)

    rows = [
        {
            "id": uuid.uuid4(),          # new surrogate PK on re-runs is fine —
            # ON CONFLICT targets `token` (unique), not `id`
            "token": TOKEN_1,
            "created_by_id": None,        # nullable — no staff user required
            "appointment_id": None,
            "patient_id": None,
            "expires_at": now + timedelta(days=7),
            "used_at": None,
            "draft_data": _FULL_DRAFT,
            "visit_purpose": "general_checkup",
            "purpose_details": None,
            "created_at": now,
        },
        {
            "id": uuid.uuid4(),
            "token": TOKEN_2,
            "created_by_id": None,
            "appointment_id": None,
            "patient_id": None,
            "expires_at": now + timedelta(days=3),
            "used_at": None,
            "draft_data": _PARTIAL_DRAFT,
            "visit_purpose": "immunization",
            "purpose_details": None,
            "created_at": now,
        },
        {
            "id": uuid.uuid4(),
            "token": TOKEN_3,
            "created_by_id": None,
            "appointment_id": None,
            "patient_id": None,
            "expires_at": now + timedelta(days=1),
            "used_at": None,
            "draft_data": None,
            "visit_purpose": None,
            "purpose_details": None,
            "created_at": now,
        },
    ]

    count = 0
    for row in rows:
        stmt = (
            pg_insert(PatientIntakeToken)
            .values(**row)
            .on_conflict_do_update(
                index_elements=["token"],
                set_={
                    "expires_at": row["expires_at"],
                    "draft_data": row["draft_data"],
                    "visit_purpose": row["visit_purpose"],
                },
            )
        )
        await session.execute(stmt)
        count += 1

    await session.commit()
    return count


async def _seed_applications(session: sa.ext.asyncio.AsyncSession) -> int:
    """
    Upsert three IntakeApplication rows.

    Uses ON CONFLICT (reference_number) DO UPDATE so re-runs are safe.
    """
    now = datetime.now(UTC)

    app_1_form = {
        "first_name": "Maria",
        "middle_name": "Santos",
        "last_name": "Reyes",
        "birth_date": "1985-03-22",
        "sex": "female",
        "civil_status": "married",
        "mobile_number": "09181234567",
        "email": "maria.reyes@example.com",
        "house_street": "456 Sampaguita St",
        "barangay": "Patubig",
        "municipality": "Marilao",
        "province": "Bulacan",
        "region": "III",
        "zip_code": "3013",
        "emergency_contact_name": "Pedro Reyes",
        "emergency_contact_relationship": "spouse",
        "emergency_contact_number": "09281234567",
        "pre_existing_conditions": "Diabetes Type 2",
        "current_medications": "Metformin 500mg",
        "data_privacy_consent": True,
    }

    app_2_form = {
        "first_name": "Jose",
        "last_name": "Bautista",
        "birth_date": "2000-11-10",
        "sex": "male",
        "mobile_number": "09351234567",
        "barangay": "Patubig",
        "municipality": "Marilao",
        "province": "Bulacan",
        "emergency_contact_name": "Ana Bautista",
        "emergency_contact_number": "09461234567",
        "data_privacy_consent": True,
    }

    app_3_form = {
        "first_name": "Lourdes",
        "last_name": "Garcia",
        "birth_date": "1975-07-04",
        "sex": "female",
        "mobile_number": "09571234567",
        "barangay": "Patubig",
        "municipality": "Marilao",
        "province": "Bulacan",
        "emergency_contact_name": "Ramon Garcia",
        "emergency_contact_number": "09681234567",
        "data_privacy_consent": True,
    }

    rows = [
        {
            "id": uuid.uuid4(),
            "reference_number": REF_1,
            "status": "pending",
            "form_data": app_1_form,
            "known_allergies": None,
            "current_medications": "Metformin 500mg",
            "pre_existing_conditions": "Diabetes Type 2",
            "reviewed_by_id": None,
            "reviewed_at": None,
            "rejection_reason": None,
            "patient_id": None,
            "submitted_ip": "127.0.0.1",
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": uuid.uuid4(),
            "reference_number": REF_2,
            "status": "pending",
            "form_data": app_2_form,
            "known_allergies": None,
            "current_medications": None,
            "pre_existing_conditions": None,
            "reviewed_by_id": None,
            "reviewed_at": None,
            "rejection_reason": None,
            "patient_id": None,
            "submitted_ip": "127.0.0.1",
            "created_at": now - timedelta(hours=2),
            "updated_at": now - timedelta(hours=2),
        },
        {
            "id": uuid.uuid4(),
            "reference_number": REF_3,
            "status": "approved",
            "form_data": app_3_form,
            "known_allergies": None,
            "current_medications": None,
            "pre_existing_conditions": None,
            "reviewed_by_id": None,   # nullable — no staff UUID required
            "reviewed_at": now - timedelta(hours=1),
            "rejection_reason": None,
            "patient_id": None,        # nullable — approved without linking for seed
            "submitted_ip": "127.0.0.1",
            "created_at": now - timedelta(days=1),
            "updated_at": now - timedelta(hours=1),
        },
    ]

    count = 0
    for row in rows:
        stmt = (
            pg_insert(IntakeApplication)
            .values(**row)
            .on_conflict_do_update(
                index_elements=["reference_number"],
                set_={
                    "status": row["status"],
                    "form_data": row["form_data"],
                    "reviewed_at": row["reviewed_at"],
                    "updated_at": now,
                },
            )
        )
        await session.execute(stmt)
        count += 1

    await session.commit()
    return count


async def main() -> None:
    print()
    print("Intake form URLs (open in browser to test):")
    print(f"  Token 1 (full draft): http://localhost:3000/intake/{TOKEN_1}")
    print(f"  Token 2 (partial):    http://localhost:3000/intake/{TOKEN_2}")
    print(f"  Token 3 (fresh):      http://localhost:3000/intake/{TOKEN_3}")
    print()

    async with AsyncSessionLocal() as session:
        token_count = await _seed_tokens(session)
        app_count = await _seed_applications(session)

    print(f"Seeded {token_count} intake tokens and {app_count} intake applications")
    print()
    print("Visible in the dashboard at:")
    print("  /registrations                   (Pre-visit Drafts tab — tokens 1 and 2 have drafts)")
    print("  /settings/intake-applications    (Online Applications tab — all 3 applications)")

    # Dispose the engine so asyncpg connection pool closes cleanly.
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
