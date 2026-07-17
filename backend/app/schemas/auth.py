"""
Pydantic v2 schemas for authentication request/response serialization.

Schemas to implement (Phase 1):
  - LoginRequest        — username + password
  - LoginResponse       — step: "otp_required", session_token (short-lived)
  - OtpVerifyRequest    — session_token + otp_code
  - TokenResponse       — access_token + refresh_token + token_type
  - RefreshRequest      — refresh_token
  - ForgotPasswordRequest — mobile_number

Full implementation: Phase 1 (Foundation & Auth).
"""

# TODO (Phase 1): Implement with SecretStr for password fields.
