"""
Security utilities: password hashing, JWT creation/verification.

Phase 1 will expand this module with full token rotation logic and
the MFA OTP helpers. For now the stubs establish the module signature.
"""

# TODO (Phase 1): Implement the following:
#   - hash_password(plain: str) -> str  using passlib Argon2
#   - verify_password(plain: str, hashed: str) -> bool
#   - create_access_token(subject: str, expires_delta: timedelta | None) -> str
#   - create_refresh_token(subject: str) -> str
#   - decode_token(token: str) -> dict[str, Any]
#   - get_current_user dependency for FastAPI route injection
