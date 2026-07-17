"""
Pydantic v2 schemas for HealthCard request/response serialization.

Schemas to implement (Phase 3):
  - HealthCardGenerateRequest   — POST /health-cards/{patient_id}/generate
  - HealthCardResponse          — includes card_version, issued_at, download_url
  - QrVerifyRequest             — POST /health-cards/verify (raw QR payload)
  - QrVerifyResponse            — verified patient_id or error

SECURITY NOTE: No schema in this file should ever include PHI fields
(name, DOB, diagnosis). The QR payload schema contains ONLY:
  patient_id (UUID), card_version (int), timestamp (int), hmac (str)

Full implementation: Phase 3 (Health Cards).
"""

# TODO (Phase 3): Implement with strict field constraints for QR payload.
