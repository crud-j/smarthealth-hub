"""
Tests for the pre-visit patient intake token workflow.

Covers:
  GET  /intake/{token}          — public token validation (valid, invalid, expired)
  PUT  /intake/{token}          — draft save (success, empty body 422, invalid token)
  POST /intake/{token}/finalize — finalize with BHW JWT (creates patient, double-use 409)
  Auth guard                    — finalize without JWT → 401/403

DB pattern: SAVEPOINT rollback from conftest.py — nothing persists between tests.
Async mode: asyncio_mode = "auto" (pyproject.toml) — no @pytest.mark.asyncio needed.

NOTE — these tests use an isolated in-memory test DB.  Data inserted by fixtures
is rolled back after each test and is NOT visible in the frontend dashboard.

To seed persistent, frontend-visible data in the dev database, run:

    cd backend/
    python -m tests.seed_intake_test_data

After seeding, open these intake form URLs in the browser to test the patient flow:

  Token 1 (full draft):  http://localhost:3000/intake/aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa
  Token 2 (partial):     http://localhost:3000/intake/bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb
  Token 3 (fresh):       http://localhost:3000/intake/cccccccc-3333-3333-3333-cccccccccccc

The three intake applications (REF-TEST-001, REF-TEST-002, REF-TEST-003) will appear
in the dashboard under /settings/intake-applications.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.intake_token import PatientIntakeToken
from app.models.patient import Patient
from app.models.user import Role, User


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

INTAKE_BASE = "/api/v1/intake"


def intake_url(token: str) -> str:
    return f"{INTAKE_BASE}/{token}"


def finalize_url(token: str) -> str:
    return f"{INTAKE_BASE}/{token}/finalize"


# ---------------------------------------------------------------------------
# Minimal valid IntakeDraftPayload for PUT /intake/{token}
# Matches IntakeDraftPayload which extends PatientCreate (all optional fields
# are omitted; only truly required fields are provided).
# ---------------------------------------------------------------------------

def _minimal_draft(**overrides: object) -> dict[str, object]:
    """Return a minimal valid IntakeDraftPayload body."""
    base: dict[str, object] = {
        "first_name": "Maria",
        "last_name": "Santos",
        "birth_date": "1995-07-20",
        "sex": "female",
        "barangay": "Patubig",
        "municipality": "Marilao",
        "province": "Bulacan",
        "address": "123 Sampaguita St, Patubig, Marilao, Bulacan",
        "is_pwd": False,
        "is_pregnant": False,
        "data_privacy_consent": True,
        "registration_source": "walk_in",
        "registration_data_source": "pre_visit",
        "visit_purpose": "General Consultation",
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Fixtures: BHW user + token, intake token factories
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def bhw_user_with_token(db_session: AsyncSession) -> tuple[User, str]:
    """
    Create a BHW user and return (user, jwt_token).

    Uses the same pattern as test_patients.py — role created inline so the
    test is self-contained within the SAVEPOINT boundary.
    """
    role = Role(id=uuid.uuid4(), name="bhw", permissions={})
    db_session.add(role)
    await db_session.commit()

    user = User(
        id=uuid.uuid4(),
        full_name="BHW Intake Tester",
        email=f"bhw_intake_{uuid.uuid4().hex[:6]}@test.local",
        mobile_number=f"+6391600{abs(uuid.uuid4().int) % 100000:05d}",
        password_hash=hash_password("BhwIntake1!"),
        role_id=role.id,
        is_active=True,
        mfa_enabled=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(role)

    token = create_access_token(subject=str(user.id), role="bhw")
    return user, token


@pytest_asyncio.fixture
async def valid_intake_token(
    db_session: AsyncSession,
    bhw_user_with_token: tuple[User, str],
) -> PatientIntakeToken:
    """
    Insert a fresh, non-expired, non-used PatientIntakeToken and return it.
    """
    user, _ = bhw_user_with_token
    tok = PatientIntakeToken(
        id=uuid.uuid4(),
        token=uuid.uuid4(),
        created_by_id=user.id,
        expires_at=datetime.now(UTC) + timedelta(hours=48),
    )
    db_session.add(tok)
    await db_session.commit()
    await db_session.refresh(tok)
    return tok


@pytest_asyncio.fixture
async def expired_intake_token(
    db_session: AsyncSession,
    bhw_user_with_token: tuple[User, str],
) -> PatientIntakeToken:
    """
    Insert a PatientIntakeToken whose expires_at is already in the past.
    """
    user, _ = bhw_user_with_token
    tok = PatientIntakeToken(
        id=uuid.uuid4(),
        token=uuid.uuid4(),
        created_by_id=user.id,
        expires_at=datetime.now(UTC) - timedelta(hours=1),
    )
    db_session.add(tok)
    await db_session.commit()
    await db_session.refresh(tok)
    return tok


@pytest_asyncio.fixture
async def drafted_intake_token(
    db_session: AsyncSession,
    bhw_user_with_token: tuple[User, str],
) -> PatientIntakeToken:
    """
    Insert a fresh token that already has draft_data populated
    (simulates a patient who has already submitted the self-entry form).
    """
    user, _ = bhw_user_with_token
    tok = PatientIntakeToken(
        id=uuid.uuid4(),
        token=uuid.uuid4(),
        created_by_id=user.id,
        expires_at=datetime.now(UTC) + timedelta(hours=48),
        draft_data=_minimal_draft(),
        visit_purpose="General Consultation",
    )
    db_session.add(tok)
    await db_session.commit()
    await db_session.refresh(tok)
    return tok


# ---------------------------------------------------------------------------
# Task 5.1 — GET /intake/{token} with valid non-expired token → 200
# ---------------------------------------------------------------------------


async def test_get_intake_token_valid(
    client: AsyncClient,
    valid_intake_token: PatientIntakeToken,
) -> None:
    """A fresh valid token returns 200 with token info and null draft_data."""
    token_str = str(valid_intake_token.token)
    resp = await client.get(intake_url(token_str))

    assert resp.status_code == 200
    body = resp.json()
    assert body["token"] == token_str
    assert "expires_at" in body
    # No draft submitted yet — draft_data must be null
    assert body["draft_data"] is None


# ---------------------------------------------------------------------------
# Task 5.2 — GET /intake/{token} with fake UUID → 404
# ---------------------------------------------------------------------------


async def test_get_intake_token_invalid(
    client: AsyncClient,
) -> None:
    """A randomly generated UUID that has no row returns 404."""
    fake_token = str(uuid.uuid4())
    resp = await client.get(intake_url(fake_token))

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Task 5.3 — GET /intake/{token} with expired token → 410
# ---------------------------------------------------------------------------


async def test_get_intake_token_expired(
    client: AsyncClient,
    expired_intake_token: PatientIntakeToken,
) -> None:
    """An expired token returns 410 Gone (as mapped by the endpoint)."""
    token_str = str(expired_intake_token.token)
    resp = await client.get(intake_url(token_str))

    # The endpoint raises HTTPException(410) for expired tokens
    assert resp.status_code == 410


# ---------------------------------------------------------------------------
# Task 5.4 — PUT /intake/{token} with valid IntakeDraftPayload → 200
# ---------------------------------------------------------------------------


async def test_save_draft_success(
    client: AsyncClient,
    valid_intake_token: PatientIntakeToken,
) -> None:
    """PUT with a valid minimal payload returns 200 and a confirmation message."""
    token_str = str(valid_intake_token.token)
    resp = await client.put(intake_url(token_str), json=_minimal_draft())

    assert resp.status_code == 200
    body = resp.json()
    assert body.get("token") == token_str
    assert "message" in body


# ---------------------------------------------------------------------------
# Task 5.5 — PUT /intake/{token} with empty body → 422
# ---------------------------------------------------------------------------


async def test_save_draft_missing_required_fields(
    client: AsyncClient,
    valid_intake_token: PatientIntakeToken,
) -> None:
    """Sending {} to PUT /intake/{token} fails Pydantic validation → 422."""
    token_str = str(valid_intake_token.token)
    resp = await client.put(intake_url(token_str), json={})

    assert resp.status_code == 422
    body = resp.json()
    # FastAPI returns {"detail": [...]} with a list of validation errors
    assert "detail" in body


# ---------------------------------------------------------------------------
# Task 5.6 — PUT /intake/{token} with a fake/non-existent token → 404
# ---------------------------------------------------------------------------


async def test_save_draft_invalid_token(
    client: AsyncClient,
) -> None:
    """PUT to a non-existent token UUID returns 404."""
    fake_token = str(uuid.uuid4())
    resp = await client.put(intake_url(fake_token), json=_minimal_draft())

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Task 5.7 — after PUT, GET should show has_draft = true via draft_data != null
# ---------------------------------------------------------------------------


async def test_save_draft_preserves_data(
    client: AsyncClient,
    valid_intake_token: PatientIntakeToken,
) -> None:
    """
    After a successful PUT, a GET on the same token returns non-null draft_data
    and the visit_purpose matches what was saved.
    """
    token_str = str(valid_intake_token.token)
    payload = _minimal_draft(visit_purpose="Immunization / Vaccination")

    put_resp = await client.put(intake_url(token_str), json=payload)
    assert put_resp.status_code == 200

    get_resp = await client.get(intake_url(token_str))
    assert get_resp.status_code == 200
    body = get_resp.json()

    # draft_data must now be populated (truthy)
    assert body["draft_data"] is not None
    # visit_purpose is promoted to its own field in the response
    assert body["visit_purpose"] == "Immunization / Vaccination"


# ---------------------------------------------------------------------------
# Task 5.8 — POST /intake/{token}/finalize without JWT → 401 or 403
# ---------------------------------------------------------------------------


async def test_finalize_requires_auth(
    client: AsyncClient,
    drafted_intake_token: PatientIntakeToken,
) -> None:
    """
    Calling finalize with no Authorization header returns 401.
    (FastAPI's get_current_user dependency raises HTTP 401 for missing creds.)
    """
    token_str = str(drafted_intake_token.token)
    resp = await client.post(finalize_url(token_str))

    # The endpoint declares dependencies=[_BHW_PLUS] which uses get_current_user
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Task 5.9 — POST /intake/{token}/finalize with BHW JWT → 201, creates patient
# ---------------------------------------------------------------------------


async def test_finalize_with_bhw_auth(
    client: AsyncClient,
    db_session: AsyncSession,
    drafted_intake_token: PatientIntakeToken,
    bhw_user_with_token: tuple[User, str],
) -> None:
    """
    A BHW can finalize a token that has draft_data — returns 201 with
    patient_id and patient_code, and a Patient row is created in the DB.
    """
    _, jwt = bhw_user_with_token
    token_str = str(drafted_intake_token.token)

    resp = await client.post(
        finalize_url(token_str),
        headers={"Authorization": f"Bearer {jwt}"},
    )

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert "patient_id" in body
    assert "patient_code" in body
    assert body["registration_data_source"] == "pre_visit"

    # Confirm the Patient row exists in the DB
    patient_id = uuid.UUID(body["patient_id"])
    result = await db_session.execute(
        select(Patient).where(Patient.id == patient_id)
    )
    patient = result.scalar_one_or_none()
    assert patient is not None
    assert patient.first_name == "Maria"
    assert patient.last_name == "Santos"


# ---------------------------------------------------------------------------
# Task 5.10 — double finalize of the same token → 404 (used_at is set)
# ---------------------------------------------------------------------------


async def test_double_finalize_rejected(
    client: AsyncClient,
    drafted_intake_token: PatientIntakeToken,
    bhw_user_with_token: tuple[User, str],
) -> None:
    """
    Finalizing the same token twice must fail on the second attempt.

    After the first finalize, intake_service.get_intake_token() raises
    ValueError("already been used") → the endpoint returns HTTP 410.
    """
    _, jwt = bhw_user_with_token
    token_str = str(drafted_intake_token.token)
    headers = {"Authorization": f"Bearer {jwt}"}

    # First finalize — must succeed
    first = await client.post(finalize_url(token_str), headers=headers)
    assert first.status_code == 201, first.text

    # Second finalize on the same token — must fail
    second = await client.post(finalize_url(token_str), headers=headers)
    # The service raises ValueError("already been used") → 410 or 409/400
    assert second.status_code in (410, 409, 400, 422), (
        f"Expected 4xx on double-finalize, got {second.status_code}: {second.text}"
    )
