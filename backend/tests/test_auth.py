"""
Authentication endpoint tests — Phase 1.

Test database: ``smarthealthhub_test`` (configured in conftest.py).
Each test runs inside a SAVEPOINT that rolls back after the test, so the DB
is always clean between tests without dropping/recreating tables.

Async mode: configured in pyproject.toml as ``asyncio_mode = "auto"`` —
every coroutine test function runs automatically without @pytest.mark.asyncio.

Covered scenarios:
  - login: valid credentials → 200 + session_hint
  - login: wrong password → 401
  - login: unknown email → 401
  - verify-otp: valid code → 200 + access_token + cookies set
  - verify-otp: expired OTP → 401
  - verify-otp: wrong code repeated until lockout → 401
  - resend-otp → 200
  - refresh token → 200 + new access_token
  - logout → 200 + cookies cleared
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.mfa_otp import MfaOtp
from app.models.user import Role, User

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

LOGIN_URL = "/api/v1/auth/login"
VERIFY_OTP_URL = "/api/v1/auth/verify-otp"
RESEND_OTP_URL = "/api/v1/auth/resend-otp"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"


async def _create_staff_user(
    db: AsyncSession,
    email: str = "staff@test.example.com",
    password: str = "TestPass1!",
    role_name: str = "bhw",
) -> User:
    """
    Insert a Role + User directly into the test DB.
    Used by tests that need a real user for login flows.
    """
    role = Role(id=uuid.uuid4(), name=role_name, permissions={})
    db.add(role)
    await db.flush()

    user = User(
        id=uuid.uuid4(),
        full_name="Test BHW",
        email=email,
        mobile_number="+639170000001",
        password_hash=hash_password(password),
        role_id=role.id,
        is_active=True,
        mfa_enabled=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _insert_otp(
    db: AsyncSession,
    user_id: uuid.UUID,
    plain_code: str,
    *,
    purpose: str = "login",
    expired: bool = False,
    attempt_count: int = 0,
) -> MfaOtp:
    """
    Persist a pre-hashed OTP row directly (bypasses generate_and_store_otp) so
    tests control the exact code and expiry state.
    """
    from passlib.hash import argon2

    expires_at = (
        datetime.now(tz=UTC) - timedelta(minutes=1)  # already expired
        if expired
        else datetime.now(tz=UTC) + timedelta(minutes=10)
    )
    otp_row = MfaOtp(
        user_id=user_id,
        otp_code_hash=argon2.hash(plain_code),
        purpose=purpose,
        expires_at=expires_at,
        is_used=False,
        attempt_count=attempt_count,
    )
    db.add(otp_row)
    await db.flush()
    return otp_row


# ---------------------------------------------------------------------------
# Login — step 1
# ---------------------------------------------------------------------------


async def test_login_valid_credentials_returns_session_hint(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    POST /auth/login with correct credentials should return HTTP 200 and a
    ``session_hint`` UUID that the client uses in the OTP verification step.
    The OTP is stubbed via a logger call (Phase 1).
    """
    user = await _create_staff_user(db_session)

    # Patch generate_and_store_otp to avoid Argon2 hashing overhead and to
    # capture the generated OTP without hitting a real DB flush path.
    with patch(
        "app.services.mfa_service.generate_and_store_otp",
        new_callable=AsyncMock,
        return_value="123456",
    ):
        resp = await client.post(
            LOGIN_URL,
            json={"email": user.email, "password": "TestPass1!"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "session_hint" in data
    # session_hint must be a valid UUID string matching the created user.
    assert data["session_hint"] == str(user.id)
    assert "message" in data


async def test_login_wrong_password_returns_401(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Wrong password → 401 Unauthorized with generic message (no enumeration)."""
    user = await _create_staff_user(db_session, email="wrongpw@test.example.com")

    resp = await client.post(
        LOGIN_URL,
        json={"email": user.email, "password": "WrongPassword999!"},
    )

    assert resp.status_code == 401
    body = resp.json()
    assert body["error"]["code"] == "unauthorized"


async def test_login_unknown_email_returns_401(
    client: AsyncClient,
) -> None:
    """Unknown email → 401 Unauthorized — same message to prevent enumeration."""
    resp = await client.post(
        LOGIN_URL,
        json={"email": "nobody@nonexistent-domain-bhc.example.com", "password": "AnyPass1!"},
    )

    assert resp.status_code == 401
    body = resp.json()
    assert body["error"]["code"] == "unauthorized"


# ---------------------------------------------------------------------------
# Verify OTP — step 2
# ---------------------------------------------------------------------------


async def test_verify_otp_valid_code_returns_tokens(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    POST /auth/verify-otp with the correct OTP should return HTTP 200,
    an ``access_token`` in the body, and set httpOnly auth cookies.
    """
    user = await _create_staff_user(db_session, email="otp_valid@test.example.com")
    await _insert_otp(db_session, user.id, "654321")
    await db_session.commit()

    resp = await client.post(
        VERIFY_OTP_URL,
        json={"user_id": str(user.id), "otp_code": "654321"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    # Auth cookies must be set.
    assert "access_token" in resp.cookies


async def test_verify_otp_expired_otp_returns_401(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """An OTP whose ``expires_at`` is in the past should be rejected with 401."""
    user = await _create_staff_user(db_session, email="otp_expired@test.example.com")
    await _insert_otp(db_session, user.id, "111111", expired=True)
    await db_session.commit()

    resp = await client.post(
        VERIFY_OTP_URL,
        json={"user_id": str(user.id), "otp_code": "111111"},
    )

    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthorized"


async def test_verify_otp_wrong_code_repeated_locks_out(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    Submitting wrong codes repeatedly should eventually lock out the OTP row.

    mfa_service.MAX_OTP_ATTEMPTS is 5 — after 5 failed verifications
    (attempt_count > MAX_OTP_ATTEMPTS triggers lock on the 6th call) the row
    is marked used and subsequent calls return 401 with a lockout message.

    We pre-seed the OTP with attempt_count=4 so the first wrong attempt in this
    test pushes it to 5 (== MAX_OTP_ATTEMPTS), and the second pushes past to 6,
    triggering the lockout branch.  This keeps the test fast without 5 round-trips.
    """
    user = await _create_staff_user(db_session, email="otp_lockout@test.example.com")
    # Pre-seed with 4 prior failed attempts so we are one attempt away from
    # the MAX_OTP_ATTEMPTS boundary.
    await _insert_otp(
        db_session, user.id, "999999", attempt_count=4
    )
    await db_session.commit()

    # 5th attempt: wrong code; attempt_count becomes 5 == MAX_OTP_ATTEMPTS.
    r1 = await client.post(
        VERIFY_OTP_URL,
        json={"user_id": str(user.id), "otp_code": "000000"},
    )
    assert r1.status_code == 401

    # 6th attempt: triggers the lockout branch (attempt_count > MAX_OTP_ATTEMPTS).
    r2 = await client.post(
        VERIFY_OTP_URL,
        json={"user_id": str(user.id), "otp_code": "000000"},
    )
    assert r2.status_code == 401
    # At this point the row is locked; the error message should mention lockout
    # OR "no active OTP" (row is now marked used).
    error_message = r2.json()["error"]["message"].lower()
    assert any(
        phrase in error_message
        for phrase in ("too many", "locked", "attempt", "invalid or expired")
    )


# ---------------------------------------------------------------------------
# Resend OTP
# ---------------------------------------------------------------------------


async def test_resend_otp_returns_200(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """POST /auth/resend-otp with a valid user_id should return HTTP 200."""
    user = await _create_staff_user(db_session, email="resend@test.example.com")
    await db_session.commit()

    with patch(
        "app.services.mfa_service.generate_and_store_otp",
        new_callable=AsyncMock,
        return_value="888888",
    ):
        resp = await client.post(
            RESEND_OTP_URL,
            json={"user_id": str(user.id)},
        )

    assert resp.status_code == 200
    assert "message" in resp.json()


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------


async def test_refresh_token_returns_new_access_token(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    POST /auth/refresh with a valid refresh token (in JSON body) should return
    HTTP 200 with a fresh access_token.
    """
    from app.core.security import create_refresh_token

    user = await _create_staff_user(db_session, email="refresh@test.example.com")
    await db_session.commit()

    refresh_tok = create_refresh_token(subject=str(user.id))

    resp = await client.post(
        REFRESH_URL,
        json={"refresh_token": refresh_tok},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    # New access token should differ from the refresh token.
    assert data["access_token"] != refresh_tok


async def test_refresh_token_invalid_returns_401(
    client: AsyncClient,
) -> None:
    """A tampered or garbage refresh token should return 401."""
    resp = await client.post(
        REFRESH_URL,
        json={"refresh_token": "garbage.token.value"},
    )

    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


async def test_logout_returns_200_and_clears_cookies(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    POST /auth/logout with a valid Bearer token should return HTTP 200 and
    clear the access_token / refresh_token cookies.
    """
    from app.core.security import create_access_token

    user = await _create_staff_user(db_session, email="logout@test.example.com")
    await db_session.commit()

    # Obtain an access token without going through the full MFA flow.
    token = create_access_token(subject=str(user.id), role="bhw")

    resp = await client.post(
        LOGOUT_URL,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    assert "message" in resp.json()

    # Cookies should be cleared (set-cookie with max-age=0 or empty value).
    set_cookie_headers = resp.headers.get_list("set-cookie")
    # At least one Set-Cookie header should reference access_token being deleted.
    access_cookie_cleared = any(
        "access_token" in h and ("max-age=0" in h.lower() or 'access_token=""' in h)
        for h in set_cookie_headers
    )
    # FastAPI's delete_cookie sets max-age=0 to expire the cookie.
    assert access_cookie_cleared, (
        f"Expected access_token cookie to be cleared. Set-Cookie headers: {set_cookie_headers}"
    )
