"""
Tests for Phase 3 — Health Card Generation Module.

Coverage:
  Unit:
    - QR HMAC round-trip (valid, tampered patient_id, tampered card_version)
    - hash_qr_url produces consistent SHA-256 digests
    - build_nfc_payload never includes PHI
    - PatientVerifySummary schema shape (only allowed fields — PHI regression guard)
    - verify_qr_payload graceful handling of bad input types

  Integration (httpx AsyncClient against real test DB via conftest.py):
    - POST /health-cards/{patient_id}/generate — creates card, returns QR + NFC
    - POST generate idempotency — second call returns same card_number
    - GET  /health-cards/{patient_id} — metadata without qr_data_uri
    - POST /health-cards/verify (QR path) — valid QR returns PatientVerifySummary
    - POST /health-cards/verify (QR path) — tampered sig returns 403 generic
    - POST /health-cards/verify response PHI audit
    - POST /health-cards/{patient_id}/nfc-link — binds UID to card
    - POST /health-cards/verify (NFC path) — valid nfc_uid returns summary
    - POST /health-cards/{patient_id}/reissue — bumps version, old HMAC invalid
    - Auth required on all mutation routes

Async mode: asyncio_mode = "auto" (configured in pyproject.toml).
"""

from __future__ import annotations

import uuid
from urllib.parse import parse_qs, urlparse

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.services.qr_service import (
    build_qr_url,
    encode_qr_payload,
    hash_qr_url,
    verify_qr_payload,
)
from app.services.nfc_payload_service import build_nfc_payload


# ============================================================================
# Helpers
# ============================================================================


def _parse_sig(signed_url: str) -> tuple[str, int, str]:
    """Parse (pid, v, sig) from a signed QR URL."""
    parsed = urlparse(signed_url)
    params = parse_qs(parsed.query)
    pid = params["pid"][0]
    v = int(params["v"][0])
    sig = params["sig"][0]
    return pid, v, sig


async def _register_patient(client: AsyncClient, token: str) -> dict:
    """Register a minimal patient via the Phase 2 patient endpoint."""
    resp = await client.post(
        "/api/v1/patients",
        json={
            "first_name": "Juan",
            "last_name": "Dela Cruz",
            "birth_date": "1990-05-15",
            "sex": "male",
            "address": "123 Main St, Barangay Test",
            "is_pwd": False,
            "is_pregnant": False,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, f"Patient registration failed: {resp.text}"
    return resp.json()


# ============================================================================
# Unit tests — qr_service
# ============================================================================


class TestQrHmac:
    """HMAC round-trip and tamper-detection tests."""

    def test_valid_signature_round_trip(self) -> None:
        """A freshly generated QR URL verifies as True."""
        pid = str(uuid.uuid4())
        signed_url, _data_uri = encode_qr_payload(pid, 1)
        parsed_pid, v, sig = _parse_sig(signed_url)
        assert verify_qr_payload(parsed_pid, v, sig) is True

    def test_tampered_patient_id_fails(self) -> None:
        """Changing patient_id after signing must invalidate the HMAC."""
        pid_a = str(uuid.uuid4())
        pid_b = str(uuid.uuid4())
        assert pid_a != pid_b

        signed_url, _ = encode_qr_payload(pid_a, 1)
        _, v, sig = _parse_sig(signed_url)

        assert verify_qr_payload(pid_b, v, sig) is False

    def test_tampered_card_version_fails(self) -> None:
        """
        Old v=1 signature must NOT verify against v=2.
        This ensures reissued cards cannot be used with old QR codes.
        """
        pid = str(uuid.uuid4())
        signed_url, _ = encode_qr_payload(pid, 1)
        _, _, sig = _parse_sig(signed_url)

        assert verify_qr_payload(pid, 2, sig) is False

    def test_empty_sig_fails(self) -> None:
        """An empty signature must not pass verification."""
        pid = str(uuid.uuid4())
        assert verify_qr_payload(pid, 1, "") is False

    def test_invalid_sig_does_not_raise(self) -> None:
        """
        verify_qr_payload must never raise — it must return False for any
        bad input.  Graceful handling is required for the all-403 verify endpoint.
        """
        result = verify_qr_payload("bad-uuid", 1, "not-hex-at-all")
        assert result is False

    def test_url_contains_only_pid_v_sig(self) -> None:
        """
        The signed URL must contain ONLY pid, v, sig query params.
        No PHI (name, DOB, address, etc.) may appear in the URL.
        """
        pid = str(uuid.uuid4())
        signed_url, _ = encode_qr_payload(pid, 3)
        params = parse_qs(urlparse(signed_url).query)

        allowed_params = {"pid", "v", "sig"}
        phi_params = set(params.keys()) - allowed_params
        assert phi_params == set(), (
            f"PHI or unexpected params found in QR URL: {phi_params}"
        )

    def test_data_uri_is_png(self) -> None:
        """encode_qr_payload must return a valid PNG data URI."""
        pid = str(uuid.uuid4())
        _url, data_uri = encode_qr_payload(pid, 1)
        assert data_uri.startswith("data:image/png;base64,")

    def test_hash_qr_url_is_deterministic(self) -> None:
        """hash_qr_url must produce the same digest for the same input."""
        url = build_qr_url("some-pid", 1)
        assert hash_qr_url(url) == hash_qr_url(url)

    def test_hash_qr_url_is_64_hex_chars(self) -> None:
        """hash_qr_url must produce a 64-character hex string (SHA-256)."""
        url = build_qr_url("some-pid", 1)
        digest = hash_qr_url(url)
        assert len(digest) == 64
        int(digest, 16)  # raises ValueError if not valid hex

    def test_hash_changes_on_version_bump(self) -> None:
        """After a version bump the stored hash must be different."""
        pid = str(uuid.uuid4())
        assert hash_qr_url(build_qr_url(pid, 1)) != hash_qr_url(build_qr_url(pid, 2))


# ============================================================================
# Unit tests — nfc_payload_service
# ============================================================================


class TestNfcPayload:
    """NFC payload structure — PHI invariant enforcement."""

    def test_contains_only_allowed_keys(self) -> None:
        """NFC payload must contain ONLY patient_id and card_version."""
        pid = str(uuid.uuid4())
        payload = build_nfc_payload(pid, 1)
        allowed_keys = {"patient_id", "card_version"}
        phi_keys = set(payload.keys()) - allowed_keys
        assert phi_keys == set(), (
            f"PHI or unexpected keys in NFC payload: {phi_keys}"
        )

    def test_values_match_input(self) -> None:
        """Values must match what was passed in."""
        pid = str(uuid.uuid4())
        payload = build_nfc_payload(pid, 7)
        assert payload["patient_id"] == pid
        assert payload["card_version"] == 7

    def test_no_common_phi_field_names(self) -> None:
        """Belt-and-suspenders: common PHI field names must not appear."""
        phi_names = {
            "name", "first_name", "last_name", "full_name", "birth_date",
            "dob", "address", "mobile", "mobile_number", "philhealth",
            "philhealth_no", "diagnosis", "treatment", "medical_history",
            "sex", "age",
        }
        pid = str(uuid.uuid4())
        payload = build_nfc_payload(pid, 1)
        found_phi = {k.lower() for k in payload.keys()} & phi_names
        assert found_phi == set(), f"PHI field names in NFC payload: {found_phi}"


# ============================================================================
# Unit tests — PatientVerifySummary schema shape
# ============================================================================


class TestPatientVerifySummaryShape:
    """Regression guard: verify response schema must never gain PHI fields."""

    _ALLOWED_FIELDS = {
        "patient_code", "full_name", "age", "sex",
        "is_senior", "is_pwd", "is_pregnant",
        "last_visit_date", "card_status",
    }

    _FORBIDDEN_FIELDS = {
        "address", "mobile_number", "philhealth_no", "philhealth_member_type",
        "diagnosis", "treatment_notes", "notes", "guardian_name",
        "guardian_contact", "birth_date", "civil_status",
    }

    def test_schema_fields_subset_of_allowed(self) -> None:
        from app.schemas.health_card import PatientVerifySummary

        schema_fields = set(PatientVerifySummary.model_fields.keys())
        unexpected = schema_fields - self._ALLOWED_FIELDS
        assert unexpected == set(), (
            f"PatientVerifySummary has unexpected fields: {unexpected}"
        )

    def test_no_forbidden_fields_in_schema(self) -> None:
        from app.schemas.health_card import PatientVerifySummary

        schema_fields = set(PatientVerifySummary.model_fields.keys())
        phi_leak = schema_fields & self._FORBIDDEN_FIELDS
        assert phi_leak == set(), (
            f"PHI fields in PatientVerifySummary: {phi_leak}"
        )

    def test_serialized_instance_no_forbidden_keys(self) -> None:
        from app.schemas.health_card import PatientVerifySummary

        instance = PatientVerifySummary(
            patient_code="BHC-2026-000001",
            full_name="Juan Dela Cruz",
            age=30,
            sex="male",
            is_senior=False,
            is_pwd=False,
            is_pregnant=False,
            last_visit_date=None,
            card_status="active",
        )
        serialized = instance.model_dump()
        phi_in_output = set(serialized.keys()) & self._FORBIDDEN_FIELDS
        assert phi_in_output == set(), (
            f"Serialized PatientVerifySummary contains PHI keys: {phi_in_output}"
        )


# ============================================================================
# Integration tests — HTTP endpoints
# ============================================================================


class TestHealthCardEndpoints:
    """
    HTTP-layer integration tests using the real FastAPI app with a SAVEPOINT-
    isolated test DB session (from conftest.py).
    """

    async def test_generate_creates_card(
        self, client: AsyncClient, bhw_token: str
    ) -> None:
        """POST generate returns 201 with card, qr_data_uri, and nfc_payload."""
        patient = await _register_patient(client, bhw_token)
        patient_id = patient["id"]

        resp = await client.post(
            f"/api/v1/health-cards/{patient_id}/generate",
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()

        assert "card" in data
        assert "qr_data_uri" in data
        assert "nfc_payload" in data

        card = data["card"]
        assert card["status"] == "active"
        assert card["card_version"] == 1
        assert card["patient_id"] == patient_id
        assert data["qr_data_uri"].startswith("data:image/png;base64,")

        nfc = data["nfc_payload"]
        assert set(nfc.keys()) == {"patient_id", "card_version"}
        assert nfc["patient_id"] == patient_id

    async def test_generate_is_idempotent(
        self, client: AsyncClient, bhw_token: str
    ) -> None:
        """Second generate call returns same card_number (no duplicate created)."""
        patient = await _register_patient(client, bhw_token)
        patient_id = patient["id"]

        resp1 = await client.post(
            f"/api/v1/health-cards/{patient_id}/generate",
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        resp2 = await client.post(
            f"/api/v1/health-cards/{patient_id}/generate",
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert resp1.status_code == 201
        assert resp2.status_code == 201
        assert (
            resp1.json()["card"]["card_number"]
            == resp2.json()["card"]["card_number"]
        )

    async def test_get_card_no_qr_data_uri(
        self, client: AsyncClient, bhw_token: str
    ) -> None:
        """GET /health-cards/{id} must return metadata with qr_data_uri=null."""
        patient = await _register_patient(client, bhw_token)
        patient_id = patient["id"]

        await client.post(
            f"/api/v1/health-cards/{patient_id}/generate",
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        resp = await client.get(
            f"/api/v1/health-cards/{patient_id}",
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"
        assert resp.json().get("qr_data_uri") is None

    async def test_verify_valid_qr(
        self, client: AsyncClient, bhw_token: str
    ) -> None:
        """Valid QR payload returns PatientVerifySummary (200)."""
        patient = await _register_patient(client, bhw_token)
        patient_id = patient["id"]

        await client.post(
            f"/api/v1/health-cards/{patient_id}/generate",
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        signed_url = build_qr_url(patient_id, 1)

        verify_resp = await client.post(
            "/api/v1/health-cards/verify",
            json={"qr_payload": signed_url},
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert verify_resp.status_code == 200, verify_resp.text
        summary = verify_resp.json()

        allowed = {
            "patient_code", "full_name", "age", "sex",
            "is_senior", "is_pwd", "is_pregnant",
            "last_visit_date", "card_status",
        }
        assert set(summary.keys()).issubset(allowed), (
            f"Unexpected PHI keys in verify response: {set(summary.keys()) - allowed}"
        )
        assert summary["card_status"] == "active"

    async def test_verify_tampered_qr_returns_403(
        self, client: AsyncClient, bhw_token: str
    ) -> None:
        """Tampered HMAC returns 403 with generic error (no info about failure reason)."""
        patient = await _register_patient(client, bhw_token)
        patient_id = patient["id"]

        await client.post(
            f"/api/v1/health-cards/{patient_id}/generate",
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        tampered = (
            f"https://smarthealthhub.local/verify"
            f"?pid={patient_id}&v=1&sig="
            "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
        )
        resp = await client.post(
            "/api/v1/health-cards/verify",
            json={"qr_payload": tampered},
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert resp.status_code == 403
        body = resp.json()
        assert "error" in body
        assert body["error"]["message"] == "Card could not be verified."

    async def test_verify_response_no_phi(
        self, client: AsyncClient, bhw_token: str
    ) -> None:
        """Verify response must contain no PHI beyond defined summary fields."""
        patient = await _register_patient(client, bhw_token)
        patient_id = patient["id"]

        await client.post(
            f"/api/v1/health-cards/{patient_id}/generate",
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        signed_url = build_qr_url(patient_id, 1)
        resp = await client.post(
            "/api/v1/health-cards/verify",
            json={"qr_payload": signed_url},
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert resp.status_code == 200
        summary = resp.json()

        forbidden = {
            "address", "mobile_number", "philhealth_no", "birth_date",
            "guardian_name", "civil_status", "diagnosis", "treatment_notes",
        }
        leaked = set(summary.keys()) & forbidden
        assert leaked == set(), f"PHI fields in verify response: {leaked}"

    async def test_nfc_link_and_verify(
        self, client: AsyncClient, bhw_token: str
    ) -> None:
        """Bind NFC UID then verify via NFC tap — returns PatientVerifySummary."""
        patient = await _register_patient(client, bhw_token)
        patient_id = patient["id"]

        await client.post(
            f"/api/v1/health-cards/{patient_id}/generate",
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        uid = f"04:{uuid.uuid4().hex[:6].upper()}"
        link_resp = await client.post(
            f"/api/v1/health-cards/{patient_id}/nfc-link",
            json={"nfc_uid": uid},
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert link_resp.status_code == 200, link_resp.text
        assert link_resp.json()["nfc_uid"] == uid

        verify_resp = await client.post(
            "/api/v1/health-cards/verify",
            json={"nfc_uid": uid},
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert verify_resp.status_code == 200, verify_resp.text
        assert verify_resp.json()["card_status"] == "active"

    async def test_reissue_bumps_version_and_invalidates_old_qr(
        self, client: AsyncClient, bhw_token: str
    ) -> None:
        """
        After reissue:
        - new card_version = 2
        - old v=1 QR returns 403
        - new v=2 QR returns 200
        """
        patient = await _register_patient(client, bhw_token)
        patient_id = patient["id"]

        await client.post(
            f"/api/v1/health-cards/{patient_id}/generate",
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        old_url = build_qr_url(patient_id, 1)

        reissue_resp = await client.post(
            f"/api/v1/health-cards/{patient_id}/reissue",
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert reissue_resp.status_code == 201, reissue_resp.text
        assert reissue_resp.json()["card"]["card_version"] == 2
        assert reissue_resp.json()["card"]["status"] == "active"

        old_verify = await client.post(
            "/api/v1/health-cards/verify",
            json={"qr_payload": old_url},
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert old_verify.status_code == 403

        new_url = build_qr_url(patient_id, 2)
        new_verify = await client.post(
            "/api/v1/health-cards/verify",
            json={"qr_payload": new_url},
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert new_verify.status_code == 200

    async def test_generate_requires_auth(self, client: AsyncClient) -> None:
        """Unauthenticated generate request returns 401."""
        resp = await client.post(f"/api/v1/health-cards/{uuid.uuid4()}/generate")
        assert resp.status_code == 401

    async def test_verify_requires_auth(self, client: AsyncClient) -> None:
        """Unauthenticated verify request returns 401."""
        resp = await client.post(
            "/api/v1/health-cards/verify",
            json={"qr_payload": "https://smarthealthhub.local/verify?pid=x&v=1&sig=y"},
        )
        assert resp.status_code == 401
