"""
Tests for patient management endpoints (Phase 2).

Covers:
  GET    /patients              — list patients (paginated, search, flag filters)
  POST   /patients              — register new patient (success, duplicate warning,
                                  duplicate bypass, missing required fields)
  GET    /patients/{id}         — full patient profile (found, not found)
  PUT    /patients/{id}         — update demographics (partial update, audit log)
  DELETE /patients/{id}         — soft-deactivate (admin only, non-admin 403)
  GET    /patients/{id}/verify  — identity summary for card-scan flow

Auth model:
  All patient endpoints require a valid JWT.  Missing token → 401.
  Deactivate requires the "admin" role — other roles → 403.

DB fixtures:
  Uses the SAVEPOINT pattern from conftest.py — nothing persists between tests.
  ``make_user`` and ``make_role`` fixtures from conftest create roles + users on
  demand; ``admin_token`` / ``bhw_token`` provide ready-to-use JWT strings.

Async mode: ``asyncio_mode = "auto"`` (pyproject.toml) — no @pytest.mark.asyncio
needed on coroutine test functions.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, UTC

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.audit_log import AuditLog
from app.models.patient import Patient
from app.models.user import Role, User


# ---------------------------------------------------------------------------
# URL constants
# ---------------------------------------------------------------------------

PATIENTS_URL = "/api/v1/patients"


def patient_url(patient_id: str | uuid.UUID) -> str:
    return f"{PATIENTS_URL}/{patient_id}"


def verify_url(patient_id: str | uuid.UUID) -> str:
    return f"{PATIENTS_URL}/{patient_id}/verify"


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> tuple[User, str]:
    """Create an admin user and return (user, token)."""
    role = Role(id=uuid.uuid4(), name="admin", permissions={})
    db_session.add(role)
    await db_session.commit()

    user = User(
        id=uuid.uuid4(),
        full_name="Admin User",
        email=f"admin_{uuid.uuid4().hex[:6]}@test.local",
        mobile_number=f"+6391800{abs(uuid.uuid4().int) % 100000:05d}",
        password_hash=hash_password("AdminPass1!"),
        role_id=role.id,
        is_active=True,
        mfa_enabled=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(role)

    token = create_access_token(subject=str(user.id), role="admin")
    return user, token


@pytest_asyncio.fixture
async def bhw_user(db_session: AsyncSession) -> tuple[User, str]:
    """Create a BHW user and return (user, token)."""
    role = Role(id=uuid.uuid4(), name="bhw", permissions={})
    db_session.add(role)
    await db_session.commit()

    user = User(
        id=uuid.uuid4(),
        full_name="BHW User",
        email=f"bhw_{uuid.uuid4().hex[:6]}@test.local",
        mobile_number=f"+6391700{abs(uuid.uuid4().int) % 100000:05d}",
        password_hash=hash_password("BhwPass1!"),
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
async def sample_patient(db_session: AsyncSession, bhw_user: tuple[User, str]) -> Patient:
    """Create and return a basic active patient."""
    user, _ = bhw_user
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"BHC-2026-{uuid.uuid4().hex[:6].upper()}",
        first_name="Maria",
        middle_name="Santos",
        last_name="Cruz",
        birth_date=date(1985, 3, 20),
        sex="female",
        address="123 Test Street, Manila",
        mobile_number=f"+63917{abs(uuid.uuid4().int) % 10000000:07d}",
        is_active=True,
        is_senior=False,
        is_pwd=False,
        is_pregnant=False,
        created_by=user.id,
    )
    db_session.add(patient)
    await db_session.commit()
    await db_session.refresh(patient)
    return patient


# ---------------------------------------------------------------------------
# Helper: minimal valid patient create payload
# ---------------------------------------------------------------------------


def _patient_payload(**overrides: object) -> dict[str, object]:
    """Return a minimal valid POST /patients payload, with optional overrides."""
    base: dict[str, object] = {
        "first_name": "Juan",
        "last_name": "DelaCruz",
        "birth_date": "1990-06-15",
        "sex": "male",
        "household_number": "HH-001",
        "sitio_purok": "Purok 3",
        "barangay": "Patubig",
        "municipality": "Marilao",
        "province": "Bulacan",
        "occupation": "Driver",
        "address": "Purok 3, Patubig, Marilao, Bulacan",
        "emergency_contact_name": "Maria DelaCruz",
        "emergency_contact_number": "09171234567",
        "is_pwd": False,
        "is_pregnant": False,
        "data_privacy_consent": True,
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# GET /patients — list
# ---------------------------------------------------------------------------


async def test_list_patients_unauthenticated_returns_401(
    client: AsyncClient,
) -> None:
    """Missing Authorization header → 401."""
    resp = await client.get(PATIENTS_URL)
    assert resp.status_code == 401


async def test_list_patients_authenticated_returns_paginated_list(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """GET /patients with a valid token returns a paginated response."""
    _, token = bhw_user
    resp = await client.get(
        PATIENTS_URL,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "page_size" in data
    assert isinstance(data["items"], list)
    # Our seeded patient must be in the result set (total >= 1)
    assert data["total"] >= 1


async def test_list_patients_search_by_last_name(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """?q=Cruz should match our sample patient by last_name."""
    _, token = bhw_user
    resp = await client.get(
        f"{PATIENTS_URL}?q=Cruz",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    names = [i["last_name"] for i in data["items"]]
    assert any("Cruz" in n for n in names)


async def test_list_patients_filter_is_senior_false(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """?is_senior=false should return patients who are not senior citizens."""
    _, token = bhw_user
    resp = await client.get(
        f"{PATIENTS_URL}?is_senior=false",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    for item in data["items"]:
        assert item["is_senior"] is False


async def test_list_patients_pagination(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """page_size=1 should return exactly 1 item even when total > 1."""
    _, token = bhw_user
    resp = await client.get(
        f"{PATIENTS_URL}?page=1&page_size=1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) <= 1
    assert data["page"] == 1
    assert data["page_size"] == 1


async def test_list_patients_sort_created_at(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """?sort=created_at should return 200 (dashboard recently-registered panel)."""
    _, token = bhw_user
    resp = await client.get(
        f"{PATIENTS_URL}?sort=created_at&page_size=5",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# POST /patients — create
# ---------------------------------------------------------------------------


async def test_create_patient_success(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """POST /patients with valid payload returns 201 and the new patient."""
    _, token = bhw_user
    payload = _patient_payload()
    resp = await client.post(
        PATIENTS_URL,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    # PatientCreateResult — no duplicate warning on first insert
    assert data["duplicate_warning"] is False
    assert data["patient"] is not None
    assert data["patient"]["last_name"] == "DelaCruz"
    assert data["patient"]["first_name"] == "Juan"
    assert data["patient"]["data_privacy_consent"] is True
    assert data["patient"]["emergency_contact_name"] == "Maria DelaCruz"
    assert data["patient"]["barangay"] == "Patubig"
    # patient_code auto-generated with BHC- prefix
    assert data["patient"]["patient_code"].startswith("BHC-")
    # is_senior computed from birth_date (1990 → not senior)
    assert data["patient"]["is_senior"] is False


async def test_create_patient_unauthenticated_returns_401(
    client: AsyncClient,
) -> None:
    """POST /patients without a token → 401."""
    resp = await client.post(PATIENTS_URL, json=_patient_payload())
    assert resp.status_code == 401


async def test_create_patient_missing_required_field_returns_422(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """POST /patients without address (required) → 422 validation error."""
    _, token = bhw_user
    payload = {
        "first_name": "Noa",
        "last_name": "Missing",
        "birth_date": "2000-01-01",
        "sex": "female",
        # address deliberately omitted
        "is_pwd": False,
        "is_pregnant": False,
    }
    resp = await client.post(
        PATIENTS_URL,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


async def test_create_patient_missing_consent_returns_422(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """data_privacy_consent must be true before a patient can be registered."""
    _, token = bhw_user
    payload = _patient_payload(data_privacy_consent=False)
    resp = await client.post(
        PATIENTS_URL,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


async def test_create_patient_invalid_birth_date_future_returns_422(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """birth_date in the future → 422 (birth_date_must_be_past validator)."""
    _, token = bhw_user
    future_date = (date.today() + timedelta(days=1)).isoformat()
    resp = await client.post(
        PATIENTS_URL,
        json=_patient_payload(birth_date=future_date),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


async def test_create_patient_invalid_sex_returns_422(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """sex must be 'male' or 'female' — other values → 422."""
    _, token = bhw_user
    resp = await client.post(
        PATIENTS_URL,
        json=_patient_payload(sex="unknown"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


async def test_create_patient_invalid_mobile_returns_422(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """Non-Philippine mobile number format → 422."""
    _, token = bhw_user
    resp = await client.post(
        PATIENTS_URL,
        json=_patient_payload(mobile_number="12345"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


async def test_create_patient_ph_mobile_normalized(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """09xx format should be accepted and normalized to +63xx."""
    _, token = bhw_user
    resp = await client.post(
        PATIENTS_URL,
        json=_patient_payload(
            last_name="NormMobile",
            mobile_number="09171234567",
        ),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["patient"]["mobile_number"] == "+639171234567"


async def test_create_patient_senior_auto_computed(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """Patient born >= 60 years ago → is_senior computed to True."""
    _, token = bhw_user
    senior_dob = (date.today() - timedelta(days=365 * 65)).isoformat()
    resp = await client.post(
        PATIENTS_URL,
        json=_patient_payload(last_name="SeniorTest", birth_date=senior_dob),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["patient"]["is_senior"] is True


async def test_create_patient_duplicate_returns_warning(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """
    Registering the same first_name + last_name + birth_date twice returns a
    duplicate_warning on the second call with HTTP 200 and no new patient.
    """
    _, token = bhw_user
    headers = {"Authorization": f"Bearer {token}"}
    payload = _patient_payload(
        first_name="DupFirst",
        last_name="DupLast",
        birth_date="1980-08-08",
    )

    # First registration succeeds.
    r1 = await client.post(PATIENTS_URL, json=payload, headers=headers)
    assert r1.status_code == 201, r1.text
    assert r1.json()["duplicate_warning"] is False

    # Second registration with same name + DOB → duplicate warning.
    r2 = await client.post(PATIENTS_URL, json=payload, headers=headers)
    assert r2.status_code == 200, r2.text
    data2 = r2.json()
    assert data2["duplicate_warning"] is True
    assert len(data2["matches"]) >= 1
    assert data2["patient"] is None


async def test_create_patient_duplicate_bypass_with_confirm(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """
    Re-submitting the same payload with confirm_duplicate=True registers
    the patient anyway (bypass the duplicate guard) — HTTP 201.
    """
    _, token = bhw_user
    headers = {"Authorization": f"Bearer {token}"}
    payload = _patient_payload(
        first_name="BypassFirst",
        last_name="BypassLast",
        birth_date="1981-09-09",
    )

    # First registration.
    r1 = await client.post(PATIENTS_URL, json=payload, headers=headers)
    assert r1.status_code == 201

    # Bypass: confirm_duplicate=True.
    payload_bypass = dict(payload, confirm_duplicate=True)
    r2 = await client.post(PATIENTS_URL, json=payload_bypass, headers=headers)
    assert r2.status_code == 201, r2.text
    assert r2.json()["duplicate_warning"] is False
    assert r2.json()["patient"] is not None


# ---------------------------------------------------------------------------
# GET /patients/{id}
# ---------------------------------------------------------------------------


async def test_get_patient_returns_full_profile(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """GET /patients/{id} returns all demographics including address."""
    _, token = bhw_user
    resp = await client.get(
        patient_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["id"] == str(sample_patient.id)
    assert data["first_name"] == sample_patient.first_name
    assert data["last_name"] == sample_patient.last_name
    assert data["address"] == sample_patient.address
    assert "age" in data
    assert "full_name" in data


async def test_get_patient_not_found_returns_404(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """GET /patients/{unknown_id} → 404."""
    _, token = bhw_user
    fake_id = uuid.uuid4()
    resp = await client.get(
        patient_url(fake_id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_get_patient_unauthenticated_returns_401(
    client: AsyncClient,
    sample_patient: Patient,
) -> None:
    """GET /patients/{id} without a token → 401."""
    resp = await client.get(patient_url(sample_patient.id))
    assert resp.status_code == 401


async def test_get_patient_writes_view_phi_audit_log(
    client: AsyncClient,
    db_session: AsyncSession,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """
    GET /patients/{id} must write a VIEW_PHI audit log entry.
    """
    _, token = bhw_user
    resp = await client.get(
        patient_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == sample_patient.id,
            AuditLog.action == "VIEW_PHI",
        )
    )
    logs = result.scalars().all()
    assert len(logs) >= 1


# ---------------------------------------------------------------------------
# PUT /patients/{id} — update demographics
# ---------------------------------------------------------------------------


async def test_update_patient_partial_update(
    client: AsyncClient,
    db_session: AsyncSession,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """PUT /patients/{id} with only first_name changes only that field."""
    _, token = bhw_user
    resp = await client.put(
        patient_url(sample_patient.id),
        json={"first_name": "Maricel"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["first_name"] == "Maricel"
    # Last name unchanged
    assert data["last_name"] == sample_patient.last_name


async def test_update_patient_is_senior_recomputed_on_birth_date_change(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """
    Changing birth_date to >= 60 years ago should re-compute is_senior to True.
    """
    _, token = bhw_user
    senior_dob = (date.today() - timedelta(days=365 * 70)).isoformat()
    resp = await client.put(
        patient_url(sample_patient.id),
        json={"birth_date": senior_dob},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_senior"] is True


async def test_update_patient_writes_audit_log(
    client: AsyncClient,
    db_session: AsyncSession,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """PUT /patients/{id} must write an UPDATE audit log entry."""
    _, token = bhw_user
    await client.put(
        patient_url(sample_patient.id),
        json={"civil_status": "married"},
        headers={"Authorization": f"Bearer {token}"},
    )

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == sample_patient.id,
            AuditLog.action == "UPDATE",
        )
    )
    logs = result.scalars().all()
    assert len(logs) >= 1


async def test_update_patient_unauthenticated_returns_401(
    client: AsyncClient,
    sample_patient: Patient,
) -> None:
    """PUT /patients/{id} without token → 401."""
    resp = await client.put(
        patient_url(sample_patient.id),
        json={"first_name": "Unauthorized"},
    )
    assert resp.status_code == 401


async def test_update_patient_not_found_returns_404(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """PUT /patients/{unknown_id} → 404."""
    _, token = bhw_user
    resp = await client.put(
        patient_url(uuid.uuid4()),
        json={"first_name": "Ghost"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /patients/{id} — soft-deactivate
# ---------------------------------------------------------------------------


async def test_deactivate_patient_admin_succeeds(
    client: AsyncClient,
    db_session: AsyncSession,
    sample_patient: Patient,
    admin_user: tuple[User, str],
) -> None:
    """DELETE /patients/{id} by admin → 204, patient.is_active becomes False."""
    _, token = admin_user
    resp = await client.delete(
        patient_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204, resp.text

    # Verify DB state — is_active flipped
    await db_session.refresh(sample_patient)
    assert sample_patient.is_active is False


async def test_deactivate_patient_writes_delete_audit_log(
    client: AsyncClient,
    db_session: AsyncSession,
    sample_patient: Patient,
    admin_user: tuple[User, str],
) -> None:
    """Deactivating a patient must write a DELETE audit log entry."""
    _, token = admin_user
    await client.delete(
        patient_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == sample_patient.id,
            AuditLog.action == "DELETE",
        )
    )
    logs = result.scalars().all()
    assert len(logs) >= 1


async def test_deactivate_patient_non_admin_returns_403(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """DELETE /patients/{id} by BHW → 403 (admin-only route)."""
    _, token = bhw_user
    resp = await client.delete(
        patient_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_deactivate_patient_unauthenticated_returns_401(
    client: AsyncClient,
    sample_patient: Patient,
) -> None:
    """DELETE /patients/{id} without token → 401."""
    resp = await client.delete(patient_url(sample_patient.id))
    assert resp.status_code == 401


async def test_deactivate_patient_not_found_returns_404(
    client: AsyncClient,
    admin_user: tuple[User, str],
) -> None:
    """DELETE /patients/{unknown_id} → 404."""
    _, token = admin_user
    resp = await client.delete(
        patient_url(uuid.uuid4()),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /patients/{id}/verify — identity card-scan summary
# ---------------------------------------------------------------------------


async def test_verify_patient_returns_summary(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """GET /patients/{id}/verify returns the identity summary for card-scan."""
    _, token = bhw_user
    resp = await client.get(
        verify_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["patient_code"] == sample_patient.patient_code
    assert "full_name" in data
    assert "age" in data
    assert "sex" in data
    assert "is_senior" in data
    assert "is_pwd" in data
    assert "is_pregnant" in data
    # PHI-safe: address and philhealth_no must NOT be in the verify response
    assert "address" not in data
    assert "philhealth_no" not in data


async def test_verify_patient_writes_view_phi_audit_log(
    client: AsyncClient,
    db_session: AsyncSession,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """GET /patients/{id}/verify must write a VIEW_PHI audit log entry."""
    _, token = bhw_user
    await client.get(
        verify_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == sample_patient.id,
            AuditLog.action == "VIEW_PHI",
        )
    )
    logs = result.scalars().all()
    assert len(logs) >= 1


async def test_verify_patient_not_found_returns_404(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """GET /patients/{unknown_id}/verify → 404."""
    _, token = bhw_user
    resp = await client.get(
        verify_url(uuid.uuid4()),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_verify_patient_unauthenticated_returns_401(
    client: AsyncClient,
    sample_patient: Patient,
) -> None:
    """GET /patients/{id}/verify without token → 401."""
    resp = await client.get(verify_url(sample_patient.id))
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PhilHealth and optional fields round-trip
# ---------------------------------------------------------------------------


async def test_create_patient_with_philhealth_fields(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """PhilHealth number and member type are stored and returned correctly."""
    _, token = bhw_user
    resp = await client.post(
        PATIENTS_URL,
        json=_patient_payload(
            last_name="PhilHealthTest",
            philhealth_no="123456789012",
            philhealth_member_type="member",
        ),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["patient"]["philhealth_no"] == "123456789012"
    assert data["patient"]["philhealth_member_type"] == "member"


async def test_create_patient_invalid_philhealth_member_type_returns_422(
    client: AsyncClient,
    bhw_user: tuple[User, str],
) -> None:
    """philhealth_member_type must be 'member' or 'dependent' — other values → 422."""
    _, token = bhw_user
    resp = await client.post(
        PATIENTS_URL,
        json=_patient_payload(philhealth_member_type="subscriber"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Inactive patient visibility
# ---------------------------------------------------------------------------


async def test_inactive_patient_excluded_from_list(
    client: AsyncClient,
    db_session: AsyncSession,
    sample_patient: Patient,
    admin_user: tuple[User, str],
    bhw_user: tuple[User, str],
) -> None:
    """
    After an admin deactivates a patient, the patient no longer appears in
    GET /patients list results.
    """
    _, admin_token = admin_user
    _, bhw_tok = bhw_user

    # Deactivate via API.
    del_resp = await client.delete(
        patient_url(sample_patient.id),
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert del_resp.status_code == 204

    # List patients — deactivated patient should be absent.
    list_resp = await client.get(
        f"{PATIENTS_URL}?q={sample_patient.last_name}",
        headers={"Authorization": f"Bearer {bhw_tok}"},
    )
    assert list_resp.status_code == 200
    ids_in_result = [i["id"] for i in list_resp.json()["items"]]
    assert str(sample_patient.id) not in ids_in_result
