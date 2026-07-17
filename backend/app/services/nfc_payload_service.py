"""
NFC payload service — encodes patient_id onto NDEF records for NFC health cards.

SECURITY INVARIANT:
  NFC chip stores ONLY the Patient ID (UUID string).
  No name, DOB, diagnosis, or any other PHI is written to the chip.
  The chip is a pointer — the BHC app resolves patient data via the API.

Full implementation: Phase 3 (Health Cards).
"""

# TODO (Phase 3): Implement:
#   encode_nfc_ndef(patient_id: UUID) -> bytes   — NDEF Text record
#   decode_nfc_ndef(raw_bytes: bytes) -> UUID     — parse & validate
