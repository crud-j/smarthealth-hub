"""
Health card generation service — orchestrates the full card pipeline:
  1. Fetch patient data from DB
  2. Generate QR code payload (patient_id + card_version + HMAC)
  3. Render QR image via qr_service
  4. Render PDF via pdf_renderer (WeasyPrint + Jinja2 templates)
  5. Persist HealthCard record + audit log entry
  6. Return PDF bytes for streaming response

SECURITY INVARIANT: PHI is used only for PDF rendering (rendered server-side).
The QR payload is patient_id + card_version + HMAC only — never includes PHI.

Full implementation: Phase 3 (Health Cards).
"""

# TODO (Phase 3): Implement CardGenerationService class.
