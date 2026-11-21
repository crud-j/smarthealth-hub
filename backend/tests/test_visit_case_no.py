"""
Visit case numbers (BHC-VISIT-{YEAR}-{6 digits}).

The next number was MAX(case_no) for the year + 1. scripts/seed_db.py gives
demo visits case numbers with 8 random hex characters (BHC-VISIT-2026-9F3A1C0B).
Those sort above every 6-digit number, don't match the pattern, and the
generator then restarted at 000001: the first new visit got 000001 and every
visit after it failed on the unique case_no ("A resource with the given data
already exists or a constraint was violated").

Only well-formed BHC-VISIT-{YEAR}-NNNNNN numbers count now.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.patient import Patient
from app.models.visit import Visit

YEAR = date.today().year


async def _patient(db: AsyncSession) -> Patient:
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"CN-{uuid.uuid4().hex[:8].upper()}",
        first_name="Case",
        last_name="Number",
        birth_date=date(1990, 1, 1),
        sex="male",
        address="Barangay Test",
        is_active=True,
    )
    db.add(patient)
    await db.flush()
    return patient


async def _existing(db: AsyncSession, patient: Patient, case_no: str) -> None:
    db.add(
        Visit(
            id=uuid.uuid4(),
            patient_id=patient.id,
            visit_date=datetime.now(tz=UTC),
            visit_type="consultation",
            case_no=case_no,
        )
    )
    await db.flush()


async def _log(client: AsyncClient, token: str, patient: Patient) -> str:
    resp = await client.post(
        f"/api/v1/patients/{patient.id}/visits",
        json={"visit_type": "consultation", "vital_signs": {}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["case_no"]


async def test_seeded_random_case_numbers_do_not_break_the_sequence(
    client: AsyncClient, make_user, db_session: AsyncSession
):
    patient = await _patient(db_session)
    await _existing(db_session, patient, f"BHC-VISIT-{YEAR}-9F3A1C0B")  # seed_db.py style
    await _existing(db_session, patient, f"BHC-VISIT-{YEAR}-0A12BC34")
    await _existing(db_session, patient, f"BHC-VISIT-{YEAR}-000001")  # first visit after seeding
    await db_session.commit()
    user = await make_user("bhw")
    token = create_access_token(subject=str(user.id), role="bhw")

    assert await _log(client, token, patient) == f"BHC-VISIT-{YEAR}-000002"
    assert await _log(client, token, patient) == f"BHC-VISIT-{YEAR}-000003"


async def test_first_visit_of_the_year_is_000001(
    client: AsyncClient, make_user, db_session: AsyncSession
):
    patient = await _patient(db_session)
    await _existing(db_session, patient, f"BHC-VISIT-{YEAR - 1}-000417")  # last year
    await _existing(db_session, patient, f"BHC-VISIT-{YEAR}-9F3A1C0B")
    await db_session.commit()
    user = await make_user("physician")
    token = create_access_token(subject=str(user.id), role="physician")

    assert await _log(client, token, patient) == f"BHC-VISIT-{YEAR}-000001"


async def test_continues_after_the_highest_well_formed_number(
    client: AsyncClient, make_user, db_session: AsyncSession
):
    patient = await _patient(db_session)
    await _existing(db_session, patient, f"BHC-VISIT-{YEAR}-000009")
    await _existing(db_session, patient, f"BHC-VISIT-{YEAR}-000041")
    await _existing(db_session, patient, f"BHC-VISIT-{YEAR}-00041")  # malformed (5 digits)
    await db_session.commit()
    user = await make_user("bhw")
    token = create_access_token(subject=str(user.id), role="bhw")

    assert await _log(client, token, patient) == f"BHC-VISIT-{YEAR}-000042"
