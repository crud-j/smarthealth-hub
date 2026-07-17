"""
MFA / OTP service — generates, stores, verifies, and expires OTP codes.

Flow:
  1. generate_otp(user_id) -> plain_code  (hashed + stored in mfa_otps table)
  2. dispatch_otp_sms(user_id, plain_code) — sends via SmsService
  3. verify_otp(user_id, input_code) -> bool  (constant-time compare, mark used)

OTP codes: 6-digit numeric, valid for 10 minutes, single-use.

Full implementation: Phase 1 (Foundation & Auth).
"""

# TODO (Phase 1): Implement MfaService class.
