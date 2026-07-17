"""
Tests for health card generation and verification (Phase 3).

Covers:
  - POST /health-cards/{patient_id}/generate — PDF bytes returned, HealthCard record created
  - POST /health-cards/verify — valid HMAC, tampered payload rejected
  - QR payload contains ONLY patient_id + card_version + hmac (no PHI)
  - Revoked card rejected at verify endpoint

Full implementation: Phase 3 (Health Cards).
"""


def test_placeholder() -> None:
    """Placeholder test — passes until Phase 3 health card tests are implemented."""
    assert True
