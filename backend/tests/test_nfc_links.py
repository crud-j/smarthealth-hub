"""
Tests for signed NFC view links and the staff-only last-scan endpoint.

Unit:
  - sign/verify round-trip, tampering, missing signature
  - build_nfc_view_url format
  - NFC_REQUIRE_SIGNED_LINKS defaults (production on, development off)

Integration:
  - HealthCardResponse exposes a signed nfc_view_url
  - /view/{card_number} and /api/v1/health-cards/view/{card_number} refuse
    unsigned / tampered links when signatures are required, accept signed ones
  - GET /api/v1/health-cards/last-scan requires a logged-in staff user
"""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.services.nfc_payload_service import (
    build_nfc_view_url,
    sign_nfc_identifier,
    verify_nfc_signature,
)

from .test_health_cards import _register_patient

# ============================================================================
# Unit tests
# ============================================================================


class TestNfcSignature:
    def test_round_trip(self) -> None:
        sig = sign_nfc_identifier("BHC-2026-000001")
        assert len(sig) == 32
        assert verify_nfc_signature("BHC-2026-000001", sig)

    def test_other_card_number_rejected(self) -> None:
        sig = sign_nfc_identifier("BHC-2026-000001")
        assert not verify_nfc_signature("BHC-2026-000002", sig)

    def test_missing_or_garbage_signature_rejected(self) -> None:
        assert not verify_nfc_signature("BHC-2026-000001", None)
        assert not verify_nfc_signature("BHC-2026-000001", "")
        assert not verify_nfc_signature("BHC-2026-000001", "0" * 32)
        assert not verify_nfc_signature("BHC-2026-000001", "ñ" * 32)

    def test_signature_is_case_insensitive(self) -> None:
        sig = sign_nfc_identifier("BHC-2026-000001")
        assert verify_nfc_signature("BHC-2026-000001", sig.upper())

    def test_build_view_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "NFC_VIEW_BASE_URL", "https://api.example.org/")
        url = build_nfc_view_url("BHC-2026-000001")
        parsed = urlparse(url)
        assert f"{parsed.scheme}://{parsed.netloc}" == "https://api.example.org"
        assert parsed.path == "/view/BHC-2026-000001"
        sig = parse_qs(parsed.query)["sig"][0]
        assert verify_nfc_signature("BHC-2026-000001", sig)

    @pytest.mark.parametrize(
        ("environment", "override", "expected"),
        [
            ("production", None, True),
            ("development", None, False),
            ("development", True, True),
            ("production", False, False),
        ],
    )
    def test_signed_links_required_default(
        self,
        monkeypatch: pytest.MonkeyPatch,
        environment: str,
        override: bool | None,
        expected: bool,
    ) -> None:
        monkeypatch.setattr(settings, "ENVIRONMENT", environment)
        monkeypatch.setattr(settings, "NFC_REQUIRE_SIGNED_LINKS", override)
        assert settings.nfc_signed_links_required is expected


# ============================================================================
# Integration tests
# ============================================================================


async def _issue_card(client: AsyncClient, token: str) -> dict:
    patient = await _register_patient(client, token)
    resp = await client.post(
        f"/api/v1/health-cards/{patient['id']}/generate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    card: dict = resp.json()["card"]
    return card


class TestSignedViewLinks:
    async def test_card_response_has_signed_link(
        self, client: AsyncClient, bhw_token: str
    ) -> None:
        card = await _issue_card(client, bhw_token)
        parsed = urlparse(card["nfc_view_url"])
        assert parsed.path.endswith(f"/view/{card['card_number']}")
        sig = parse_qs(parsed.query)["sig"][0]
        assert verify_nfc_signature(card["card_number"], sig)

    @pytest.mark.parametrize("prefix", ["/view", "/api/v1/health-cards/view"])
    async def test_signatures_enforced(
        self,
        client: AsyncClient,
        bhw_token: str,
        monkeypatch: pytest.MonkeyPatch,
        prefix: str,
    ) -> None:
        monkeypatch.setattr(settings, "NFC_REQUIRE_SIGNED_LINKS", True)
        card = await _issue_card(client, bhw_token)
        number = card["card_number"]

        unsigned = await client.get(f"{prefix}/{number}")
        assert unsigned.status_code == 403
        assert "Juan" not in unsigned.text

        tampered = await client.get(f"{prefix}/{number}", params={"sig": "0" * 32})
        assert tampered.status_code == 403

        signed = await client.get(
            f"{prefix}/{number}", params={"sig": sign_nfc_identifier(number)}
        )
        assert signed.status_code == 200, signed.text
        assert "Juan" in signed.text

    async def test_unsigned_allowed_when_not_required(
        self,
        client: AsyncClient,
        bhw_token: str,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "NFC_REQUIRE_SIGNED_LINKS", False)
        card = await _issue_card(client, bhw_token)
        resp = await client.get(f"/view/{card['card_number']}")
        assert resp.status_code == 200, resp.text


class TestLastScanRequiresStaff:
    async def test_anonymous_rejected(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/health-cards/last-scan")
        assert resp.status_code == 401

    async def test_staff_allowed(self, client: AsyncClient, bhw_token: str) -> None:
        resp = await client.get(
            "/api/v1/health-cards/last-scan",
            headers={"Authorization": f"Bearer {bhw_token}"},
        )
        assert resp.status_code == 200, resp.text
        assert "found" in resp.json()
