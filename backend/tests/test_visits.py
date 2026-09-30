"""
Tests for visit/consultation API endpoints.

Covers:
  GET /patients/{patient_id}/visits         — list visit summaries (no PHI)
  POST /patients/{patient_id}/visits        — log a new visit
  GET /visits/{visit_id}                    — full visit with decrypted PHI

RBAC findings (confirmed from endpoint source):
  POST /patients/{id}/visits  — _CLINICAL = require_role("physician", "bhw", "admin")
  GET  /visits/{visit_id}     — _PHI_READ = require_role("physician", "admin")
  GET  list                   — any authenticated role

Encryption findings:
  ``diagnosis`` and ``treatment_notes`` on the visits table are AES-256-GCM
  encrypted before INSERT (column names: ``diagnosis``, ``treatment_notes``).
  Ciphertext format: base64(nonce[12] || ciphertext_and_gcm_tag).
  Raw DB value is guaranteed != plaintext and is non-empty.

Case number format: BHC-VISIT-{YEAR}-{6-digit-seq}  e.g. BHC-VISIT-2026-000001
  Confirmed from visit_service._next_case_no: prefix = f"BHC-VISIT-{year}-"

Async mode: ``asyncio_mode = "auto"`` (pyproject.toml) — no @pytest.mark.asyncio.
DB isolation: SAVEPOINT pattern from conftest.py — nothing persists between tests.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.audit_log import AuditLog
from app.models.patient import Patient
from app.models.user import Role, User
from app.models.visit import Visit


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

BASE = "/api/v1"


def patient_visits_url(patient_id: str | uuid.UUID) -> str:
    return f"{BASE}/patients/{patient_id}/visits"


def visit_url(visit_id: str | uuid.UUID) -> str:
    return f"{BASE}/visits/{visit_id}"


# ---------------------------------------------------------------------------
# Payload helper
# ---------------------------------------------------------------------------


def _visit_payload(**overrides: object) -> dict[str, object]:
    """Return a minimal valid POST visit payload with optional overrides."""
    base: dict[str, object] = {
        "visit_type": "consultation",
        "chief_complaint": "Headache and dizziness",
        "vital_signs": {
            "blood_pressure": "130/85 mmHg",
            "temperature": 37.0,
        },
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Local fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def physician_user(db_session: AsyncSession) -> tuple[User, str]:
    """Create a Physician user and return (user, token)."""
    role = Role(id=uuid.uuid4(), name="physician", permissions={})
    db_session.add(role)
    await db_session.commit()

    user = User(
        id=uuid.uuid4(),
        full_name="Test Physician",
        email=f"physician_{uuid.uuid4().hex[:6]}@test.local",
        mobile_number=f"+6391600{abs(uuid.uuid4().int) % 100000:05d}",
        password_hash=hash_password("DocPass1!"),
        role_id=role.id,
        is_active=True,
        mfa_enabled=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    token = create_access_token(subject=str(user.id), role="physician")
    return user, token


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> tuple[User, str]:
    """Create an Admin user and return (user, token)."""
    role = Role(id=uuid.uuid4(), name="admin", permissions={})
    db_session.add(role)
    await db_session.commit()

    user = User(
        id=uuid.uuid4(),
        full_name="Test Admin",
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
        full_name="Test BHW",
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

    token = create_access_token(subject=str(user.id), role="bhw")
    return user, token


@pytest_asyncio.fixture
async def admin_staff_user(db_session: AsyncSession) -> tuple[User, str]:
    """Create an Admin Staff user and return (user, token)."""
    role = Role(id=uuid.uuid4(), name="admin_staff", permissions={})
    db_session.add(role)
    await db_session.commit()

    user = User(
        id=uuid.uuid4(),
        full_name="Test Admin Staff",
        email=f"admin_staff_{uuid.uuid4().hex[:6]}@test.local",
        mobile_number=f"+6391500{abs(uuid.uuid4().int) % 100000:05d}",
        password_hash=hash_password("StaffPass1!"),
        role_id=role.id,
        is_active=True,
        mfa_enabled=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    token = create_access_token(subject=str(user.id), role="admin_staff")
    return user, token


@pytest_asyncio.fixture
async def sample_patient(
    db_session: AsyncSession,
    bhw_user: tuple[User, str],
) -> Patient:
    """Create and return a basic active patient."""
    user, _ = bhw_user
    patient = Patient(
        id=uuid.uuid4(),
        patient_code=f"BHC-2026-{uuid.uuid4().hex[:6].upper()}",
        first_name="Juan",
        middle_name="Dela",
        last_name="Cruz",
        birth_date=date(1978, 7, 22),
        sex="male",
        address="789 Test Avenue, Quezon City",
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
# Helper: create a visit via POST and return parsed JSON
# ---------------------------------------------------------------------------


async def _create_visit(
    client: AsyncClient,
    patient_id: uuid.UUID,
    token: str,
    **overrides: object,
) -> dict[str, object]:
    """POST a new visit and assert 201. Return the response JSON."""
    resp = await client.post(
        patient_visits_url(patient_id),
        json=_visit_payload(**overrides),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# GET /patients/{patient_id}/visits — list (no PHI)
# ---------------------------------------------------------------------------


async def test_list_visits_requires_auth(
    client: AsyncClient,
    sample_patient: Patient,
) -> None:
    """GET without Authorization header → 401."""
    resp = await client.get(patient_visits_url(sample_patient.id))
    assert resp.status_code == 401


async def test_list_visits_bhw_can_list(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """BHW can list visit summaries for any patient."""
    _, token = bhw_user
    resp = await client.get(
        patient_visits_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_list_visits_empty_for_new_patient(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """A newly created patient has no visit records."""
    _, token = bhw_user
    resp = await client.get(
        patient_visits_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_list_visits_returns_created_record(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
    bhw_user: tuple[User, str],
) -> None:
    """After creating a visit, it appears in the list with the correct visit_type."""
    _, phys_token = physician_user
    _, bhw_token = bhw_user

    await _create_visit(client, sample_patient.id, phys_token, visit_type="prenatal_checkup")

    resp = await client.get(
        patient_visits_url(sample_patient.id),
        headers={"Authorization": f"Bearer {bhw_token}"},
    )
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 1
    visit_types = [v["visit_type"] for v in items]
    assert "prenatal_checkup" in visit_types


async def test_list_visits_does_not_include_phi(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """List view must NOT include diagnosis or treatment_notes (PHI minimisation)."""
    _, token = physician_user

    await _create_visit(
        client,
        sample_patient.id,
        token,
        diagnosis="Pneumonia",
        treatment_notes="Amoxicillin 500mg TID x 7 days",
    )

    resp = await client.get(
        patient_visits_url(sample_patient.id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 1
    for item in items:
        assert "diagnosis" not in item, "List view must not expose diagnosis"
        assert "treatment_notes" not in item, "List view must not expose treatment_notes"


# ---------------------------------------------------------------------------
# POST /patients/{patient_id}/visits — create
# ---------------------------------------------------------------------------


async def test_create_visit_success(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """POST with valid body → 201, response has case_no in correct format and matching visit_type."""
    _, token = physician_user
    resp = await client.post(
        patient_visits_url(sample_patient.id),
        json=_visit_payload(visit_type="consultation"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["visit_type"] == "consultation"
    assert data["patient_id"] == str(sample_patient.id)
    assert "id" in data
    assert "case_no" in data
    assert "created_at" in data

    # Verify case_no format: starts with "BHC-VISIT-" and matches expected pattern
    case_no = data["case_no"]
    assert case_no is not None
    assert case_no.startswith("BHC-VISIT-"), f"case_no format wrong: {case_no!r}"
    # Full pattern: BHC-VISIT-YYYY-NNNNNN
    parts = case_no.split("-")
    assert len(parts) == 4, f"case_no has unexpected format: {case_no!r}"
    assert parts[0] == "BHC"
    assert parts[1] == "VISIT"
    assert len(parts[2]) == 4 and parts[2].isdigit(), f"year part malformed: {case_no!r}"
    assert len(parts[3]) == 6 and parts[3].isdigit(), f"seq part malformed: {case_no!r}"


async def test_create_visit_bhw_can_create(
    client: AsyncClient,
    sample_patient: Patient,
    bhw_user: tuple[User, str],
) -> None:
    """BHW role is in _CLINICAL and can create visits → 201."""
    _, token = bhw_user
    resp = await client.post(
        patient_visits_url(sample_patient.id),
        json=_visit_payload(visit_type="immunization_admin"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["visit_type"] == "immunization_admin"


async def test_create_visit_admin_staff_forbidden(
    client: AsyncClient,
    sample_patient: Patient,
    admin_staff_user: tuple[User, str],
) -> None:
    """Admin Staff is NOT in _CLINICAL = require_role('physician', 'bhw', 'admin') → 403.
    Confirmed from endpoint: _CLINICAL guards the POST route.
    """
    _, token = admin_staff_user
    resp = await client.post(
        patient_visits_url(sample_patient.id),
        json=_visit_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_create_visit_unauthenticated_returns_401(
    client: AsyncClient,
    sample_patient: Patient,
) -> None:
    """POST without Authorization header → 401."""
    resp = await client.post(
        patient_visits_url(sample_patient.id),
        json=_visit_payload(),
    )
    assert resp.status_code == 401


async def test_create_visit_missing_visit_type_returns_422(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """POST without the required visit_type field → 422."""
    _, token = physician_user
    resp = await client.post(
        patient_visits_url(sample_patient.id),
        json={"chief_complaint": "Fever"},  # missing required visit_type
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


async def test_create_visit_unknown_patient_returns_404(
    client: AsyncClient,
    physician_user: tuple[User, str],
) -> None:
    """POST to a non-existent patient_id → 404 Not Found."""
    _, token = physician_user
    resp = await client.post(
        patient_visits_url(uuid.uuid4()),
        json=_visit_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_create_visit_encrypts_diagnosis(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
    db_session: AsyncSession,
) -> None:
    """POST with plaintext diagnosis → the DB stores encrypted ciphertext, NOT the plaintext.

    The ``diagnosis`` column on the visits table stores AES-256-GCM ciphertext:
    base64(nonce[12] || ciphertext_and_gcm_tag).  It is guaranteed to differ
    from the original plaintext string.
    """
    _, token = physician_user
    plaintext_diagnosis = "Community-acquired pneumonia, right lower lobe"

    resp = await client.post(
        patient_visits_url(sample_patient.id),
        json=_visit_payload(diagnosis=plaintext_diagnosis),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    visit_id = uuid.UUID(resp.json()["id"])

    # Query DB directly to read the raw stored value
    result = await db_session.execute(
        select(Visit).where(Visit.id == visit_id)
    )
    visit: Visit | None = result.scalar_one_or_none()
    assert visit is not None, "Visit not found in DB"

    raw_diagnosis = visit.diagnosis
    assert raw_diagnosis is not None, "diagnosis column is None — value was not stored"
    assert raw_diagnosis != plaintext_diagnosis, (
        f"diagnosis column stores plaintext instead of encrypted ciphertext: {raw_diagnosis!r}"
    )
    # Ciphertext should be non-empty
    assert len(raw_diagnosis) > 0


async def test_create_visit_encrypts_treatment_notes(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
    db_session: AsyncSession,
) -> None:
    """POST with plaintext treatment_notes → the DB stores encrypted ciphertext.

    Like diagnosis, treatment_notes is AES-256-GCM encrypted before INSERT.
    """
    _, token = physician_user
    plaintext_treatment = "Amoxicillin-clavulanate 875/125 mg BID x 7 days. Rest and hydration."

    resp = await client.post(
        patient_visits_url(sample_patient.id),
        json=_visit_payload(treatment_notes=plaintext_treatment),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    visit_id = uuid.UUID(resp.json()["id"])

    result = await db_session.execute(
        select(Visit).where(Visit.id == visit_id)
    )
    visit: Visit | None = result.scalar_one_or_none()
    assert visit is not None

    raw_treatment = visit.treatment_notes
    assert raw_treatment is not None, "treatment_notes column is None — value was not stored"
    assert raw_treatment != plaintext_treatment, (
        f"treatment_notes column stores plaintext instead of encrypted ciphertext: {raw_treatment!r}"
    )
    assert len(raw_treatment) > 0


async def test_create_visit_vital_signs_stored(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """POST with specific vital signs → GET /visits/{id} returns those exact values."""
    _, token = physician_user

    payload = _visit_payload(
        visit_type="consultation",
        vital_signs={
            "blood_pressure": "140/90 mmHg",
            "weight_kg": 72.5,
            "height_cm": 165.0,
            "temperature": 38.2,
            "pulse_rate": 88,
            "respiratory_rate": 18,
            "oxygen_saturation": 97,
        },
    )
    create_resp = await client.post(
        patient_visits_url(sample_patient.id),
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_resp.status_code == 201, create_resp.text
    visit_id = create_resp.json()["id"]

    # GET /visits/{visit_id} with physician (PHI_READ role)
    get_resp = await client.get(
        visit_url(visit_id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_resp.status_code == 200, get_resp.text
    data = get_resp.json()

    assert data["blood_pressure"] == "140/90 mmHg"
    assert data["weight_kg"] == 72.5
    assert data["height_cm"] == 165.0
    assert data["temperature"] == 38.2
    assert data["pulse_rate"] == 88
    assert data["respiratory_rate"] == 18
    assert data["oxygen_saturation"] == 97


async def test_create_visit_writes_audit_log(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
    db_session: AsyncSession,
) -> None:
    """POST → 201 must write a CREATE audit log row with entity_type='visit'."""
    _, token = physician_user

    resp = await client.post(
        patient_visits_url(sample_patient.id),
        json=_visit_payload(visit_type="follow_up"),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    visit_id = uuid.UUID(resp.json()["id"])

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == visit_id,
            AuditLog.action == "CREATE",
            AuditLog.entity_type == "visit",
        )
    )
    logs = result.scalars().all()
    assert len(logs) >= 1, "Expected a CREATE audit log entry for visit"


# ---------------------------------------------------------------------------
# GET /visits/{visit_id} — full visit with decrypted PHI (physician/admin only)
# ---------------------------------------------------------------------------


async def test_get_full_visit_decrypts_phi(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """POST visit with diagnosis, then GET /visits/{id} returns decrypted plaintext diagnosis."""
    _, token = physician_user
    plaintext_diagnosis = "Essential hypertension, uncontrolled"

    created = await _create_visit(
        client,
        sample_patient.id,
        token,
        diagnosis=plaintext_diagnosis,
        treatment_notes="Amlodipine 5mg once daily",
    )
    visit_id = created["id"]

    resp = await client.get(
        visit_url(visit_id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # The service decrypts before building the response
    assert data["diagnosis"] == plaintext_diagnosis
    assert data["treatment_notes"] == "Amlodipine 5mg once daily"
    assert data["patient_id"] == str(sample_patient.id)


async def test_get_full_visit_requires_auth(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """GET /visits/{visit_id} without Authorization header → 401."""
    _, token = physician_user
    created = await _create_visit(client, sample_patient.id, token)
    visit_id = created["id"]

    resp = await client.get(visit_url(visit_id))
    assert resp.status_code == 401


async def test_get_full_visit_bhw_forbidden(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
    bhw_user: tuple[User, str],
) -> None:
    """BHW is NOT in _PHI_READ = require_role('physician', 'admin') → 403 on GET /visits/{id}.
    Confirmed from endpoint: _PHI_READ guards the get_visit route.
    """
    _, phys_token = physician_user
    _, bhw_token = bhw_user

    created = await _create_visit(client, sample_patient.id, phys_token)
    visit_id = created["id"]

    resp = await client.get(
        visit_url(visit_id),
        headers={"Authorization": f"Bearer {bhw_token}"},
    )
    assert resp.status_code == 403


async def test_get_full_visit_writes_view_phi_audit(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
    db_session: AsyncSession,
) -> None:
    """GET /visits/{visit_id} always writes a VIEW_PHI audit log row.

    Confirmed from visit_service.get_visit: always calls
    write_audit_log(action='VIEW_PHI', entity_type='visit').
    """
    _, token = physician_user

    created = await _create_visit(
        client,
        sample_patient.id,
        token,
        diagnosis="Dengue fever, day 3",
    )
    visit_id = uuid.UUID(created["id"])

    # Access the full PHI endpoint
    resp = await client.get(
        visit_url(visit_id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.entity_id == visit_id,
            AuditLog.action == "VIEW_PHI",
            AuditLog.entity_type == "visit",
        )
    )
    logs = result.scalars().all()
    assert len(logs) >= 1, "Expected a VIEW_PHI audit log entry for visit"


async def test_get_full_visit_admin_can_access(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
    admin_user: tuple[User, str],
) -> None:
    """Admin role is in _PHI_READ and can access GET /visits/{visit_id} → 200."""
    _, phys_token = physician_user
    _, admin_token = admin_user

    created = await _create_visit(
        client,
        sample_patient.id,
        phys_token,
        diagnosis="Acute gastroenteritis",
    )
    visit_id = created["id"]

    resp = await client.get(
        visit_url(visit_id),
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["diagnosis"] == "Acute gastroenteritis"


async def test_get_full_visit_not_found_returns_404(
    client: AsyncClient,
    physician_user: tuple[User, str],
) -> None:
    """GET /visits/{visit_id} with a non-existent visit_id → 404."""
    _, token = physician_user
    resp = await client.get(
        visit_url(uuid.uuid4()),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_create_visit_case_no_auto_increments(
    client: AsyncClient,
    sample_patient: Patient,
    physician_user: tuple[User, str],
) -> None:
    """Creating two visits without providing case_no yields sequentially numbered case numbers."""
    _, token = physician_user

    first = await _create_visit(client, sample_patient.id, token, visit_type="consultation")
    second = await _create_visit(client, sample_patient.id, token, visit_type="follow_up")

    first_seq = int(first["case_no"].split("-")[3])  # type: ignore[index]
    second_seq = int(second["case_no"].split("-")[3])  # type: ignore[index]
    assert second_seq == first_seq + 1, (
        f"Expected sequential case numbers: {first['case_no']} → {second['case_no']}"
    )
