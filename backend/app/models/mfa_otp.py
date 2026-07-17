"""
MFA OTP token ORM model.

Columns (SDP Section 4 — mfa_otps table):
  id, user_id (FK), otp_code (hashed), purpose (login|password_reset),
  expires_at, is_used, created_at

OTP codes are hashed before storage (Argon2) — never stored in plaintext.

Full implementation: Phase 1 (Foundation & Auth).
"""

# TODO (Phase 1): Implement with TTL-based cleanup via Celery beat.
