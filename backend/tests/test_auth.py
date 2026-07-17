"""
Tests for authentication endpoints (Phase 1).

Covers:
  - POST /auth/login — valid credentials, invalid credentials, locked account
  - POST /auth/verify-otp — valid OTP, expired OTP, already-used OTP
  - POST /auth/resend-otp — rate limiting
  - POST /auth/refresh — token rotation
  - POST /auth/logout

Full implementation: Phase 1 (Foundation & Auth).
"""


def test_placeholder() -> None:
    """Placeholder test — passes until Phase 1 auth tests are implemented."""
    assert True
