"""
Health card ORM model.

Columns (SDP Section 4 — health_cards table):
  id, patient_id (FK), card_version, qr_hmac_signature,
  nfc_uid (optional — written on physical NFC chip),
  pdf_path, status (active|revoked), issued_at,
  issued_by_id (FK → users), revoked_at, created_at

SECURITY INVARIANT:
  The QR payload and NFC chip store ONLY patient_id + card_version.
  No PHI is ever encoded in the card payload.
  HMAC signature ensures payload authenticity.

Full implementation: Phase 3 (Health Cards).
"""

# TODO (Phase 3): Implement with WeasyPrint PDF generation pipeline.
