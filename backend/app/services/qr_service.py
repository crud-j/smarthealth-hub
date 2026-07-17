"""
QR code generation and verification service.

Payload schema (NEVER include PHI):
  {
    "pid": "<patient_uuid>",
    "v":   <card_version_int>,
    "ts":  <unix_timestamp_int>,
    "sig": "<hmac_sha256_hex>"
  }

Signature: HMAC-SHA256(f"{pid}:{v}:{ts}", QR_HMAC_SECRET)

Full implementation: Phase 3 (Health Cards).
"""

# TODO (Phase 3): Implement:
#   generate_qr_payload(patient_id: UUID, card_version: int) -> str (JSON)
#   generate_qr_image(payload: str) -> bytes (PNG)
#   verify_qr_payload(payload: str) -> UUID | None
