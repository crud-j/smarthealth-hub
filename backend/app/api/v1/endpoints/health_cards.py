"""
Health card generation and verification endpoints.

  POST   /health-cards/{patient_id}/generate  — generate PDF (WeasyPrint) + QR code
  GET    /health-cards/{patient_id}/download  — stream PDF for print
  POST   /health-cards/verify                 — verify QR HMAC signature
  GET    /health-cards/{patient_id}/history   — card version history

SECURITY: QR payload contains ONLY patient_id + card_version + HMAC signature.
No PHI (name, DOB, diagnosis) is ever encoded in the QR or NFC payload.

Full implementation: Phase 3 (Health Cards).
"""

from fastapi import APIRouter

router = APIRouter()

# TODO (Phase 3): Implement card generation pipeline:
#   patient_id → QR (HMAC-signed) → WeasyPrint PDF → stream response
