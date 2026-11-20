"""
Failed sign-in records must survive the request's rollback.

In production ``get_db`` rolls the session back when the endpoint raises
(app/db/session.py). Failed logins and wrong OTP codes raise 401/403, so
anything they only *flushed* was thrown away:

  - ``LOGIN_FAILED`` audit rows never reached the database (confirmed on the
    production server: zero rows after a wrong password),
  - the OTP ``attempt_count`` never grew, so the 5-wrong-codes lockout in
    ``mfa_service.verify_otp`` could never trigger.

The shared ``client`` fixture hides this because its ``get_db`` override never
rolls back. These tests use ``prod_client``, whose override does exactly what
production does on an error.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from passlib.hash import argon2
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.session import get_db
from app.main import app
from app.models.audit_log import AuditLog
from app.models.mfa_otp import MfaOtp
from app.models.user import Role, User
from app.services.mfa_service import MAX_OTP_ATTEMPTS

LOGIN_URL = "/api/v1/auth/login"
VERIFY_OTP_URL = "/api/v1/auth/verify-otp"
PASSWORD = "TestPass1!"


@pytest_asyncio.fixture
async def prod_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client whose ``get_db`` rolls back on errors, like production."""

    async def prod_like_get_db() -> AsyncGenerator[AsyncSession, None]:
        try:
            yield db_session
        except Exception:
            await db_session.rollback()
            raise

    app.dependency_overrides[get_db] = prod_like_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _user(db: AsyncSession, *, active: bool = True) -> tuple[uuid.UUID, str]:
    """Create a committed user; return plain values (a rollback expires ORM objects)."""
    role = Role(id=uuid.uuid4(), name=f"bhw-{uuid.uuid4().hex[:6]}", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        id=uuid.uuid4(),
        full_name="Test Signin",
        email=f"signin-{uuid.uuid4().hex[:8]}@test.example.com",
        mobile_number="+639170000002",
        password_hash=hash_password(PASSWORD),
        role_id=role.id,
        is_active=active,
        mfa_enabled=True,
    )
    db.add(user)
    # Commit so the user survives the rollback of the failing request.
    user_id, email = user.id, user.email
    await db.commit()
    return user_id, email


async def _otp(db: AsyncSession, user_id: uuid.UUID, code: str, attempts: int = 0) -> uuid.UUID:
    row = MfaOtp(
        user_id=user_id,
        otp_code_hash=argon2.hash(code),
        purpose="login",
        expires_at=datetime.now(tz=UTC) + timedelta(minutes=10),
        is_used=False,
        attempt_count=attempts,
    )
    db.add(row)
    await db.flush()  # id comes from the database default
    otp_id = row.id
    await db.commit()
    return otp_id


async def _audit_rows(db: AsyncSession, user_id: uuid.UUID, action: str) -> list[AuditLog]:
    result = await db.execute(
        select(AuditLog).where(AuditLog.user_id == user_id, AuditLog.action == action)
    )
    return list(result.scalars().all())


async def _otp_state(db: AsyncSession, otp_id: uuid.UUID) -> tuple[int, bool]:
    result = await db.execute(
        select(MfaOtp.attempt_count, MfaOtp.is_used).where(MfaOtp.id == otp_id)
    )
    attempts, used = result.one()
    return attempts, used


# ---------------------------------------------------------------------------
# Step 1: email + password
# ---------------------------------------------------------------------------


async def test_wrong_password_is_recorded(
    prod_client: AsyncClient, db_session: AsyncSession
) -> None:
    user_id, email = await _user(db_session)

    resp = await prod_client.post(LOGIN_URL, json={"email": email, "password": "Wrong1234"})

    assert resp.status_code == 401
    rows = await _audit_rows(db_session, user_id, "LOGIN_FAILED")
    assert len(rows) == 1
    assert rows[0].metadata_ == {"reason": "wrong_password"}


async def test_disabled_account_is_recorded(
    prod_client: AsyncClient, db_session: AsyncSession
) -> None:
    user_id, email = await _user(db_session, active=False)

    resp = await prod_client.post(LOGIN_URL, json={"email": email, "password": PASSWORD})

    assert resp.status_code == 403
    rows = await _audit_rows(db_session, user_id, "LOGIN_FAILED")
    assert [r.metadata_ for r in rows] == [{"reason": "account_disabled"}]


async def test_unknown_email_writes_nothing(
    prod_client: AsyncClient, db_session: AsyncSession
) -> None:
    resp = await prod_client.post(
        LOGIN_URL, json={"email": "nobody@test.example.com", "password": PASSWORD}
    )

    assert resp.status_code == 401
    result = await db_session.execute(select(AuditLog).where(AuditLog.action == "LOGIN_FAILED"))
    assert result.scalars().all() == []


# ---------------------------------------------------------------------------
# Step 2: OTP code
# ---------------------------------------------------------------------------


async def test_wrong_otp_counts_the_attempt_and_is_recorded(
    prod_client: AsyncClient, db_session: AsyncSession
) -> None:
    user_id, email = await _user(db_session)
    otp_id = await _otp(db_session, user_id, "123456")

    resp = await prod_client.post(
        VERIFY_OTP_URL, json={"user_id": str(user_id), "otp_code": "999999"}
    )

    assert resp.status_code == 401
    assert await _otp_state(db_session, otp_id) == (1, False)
    rows = await _audit_rows(db_session, user_id, "OTP_FAILED")
    assert [r.metadata_ for r in rows] == [
        {"reason": "wrong_code", "purpose": "login", "attempt": 1}
    ]


async def test_otp_lockout_is_kept(prod_client: AsyncClient, db_session: AsyncSession) -> None:
    """After MAX_OTP_ATTEMPTS wrong codes the OTP stays locked, even with the right code."""
    user_id, email = await _user(db_session)
    otp_id = await _otp(db_session, user_id, "123456", attempts=MAX_OTP_ATTEMPTS)

    locked = await prod_client.post(
        VERIFY_OTP_URL, json={"user_id": str(user_id), "otp_code": "999999"}
    )
    assert locked.status_code == 401
    assert "Too many failed OTP attempts" in locked.text
    assert await _otp_state(db_session, otp_id) == (MAX_OTP_ATTEMPTS + 1, True)

    rows = await _audit_rows(db_session, user_id, "OTP_FAILED")
    assert [r.metadata_["reason"] for r in rows] == ["too_many_attempts"]

    # The right code no longer works: the row is used up.
    retry = await prod_client.post(
        VERIFY_OTP_URL, json={"user_id": str(user_id), "otp_code": "123456"}
    )
    assert retry.status_code == 401
    assert await _audit_rows(db_session, user_id, "LOGIN") == []


async def test_expired_or_missing_otp_is_recorded(
    prod_client: AsyncClient, db_session: AsyncSession
) -> None:
    user_id, email = await _user(db_session)

    resp = await prod_client.post(
        VERIFY_OTP_URL, json={"user_id": str(user_id), "otp_code": "123456"}
    )

    assert resp.status_code == 401
    rows = await _audit_rows(db_session, user_id, "OTP_FAILED")
    assert [r.metadata_["reason"] for r in rows] == ["expired_or_missing"]


async def test_right_otp_still_logs_in(prod_client: AsyncClient, db_session: AsyncSession) -> None:
    user_id, email = await _user(db_session)
    otp_id = await _otp(db_session, user_id, "123456")

    resp = await prod_client.post(
        VERIFY_OTP_URL, json={"user_id": str(user_id), "otp_code": "123456"}
    )

    assert resp.status_code == 200
    assert await _otp_state(db_session, otp_id) == (1, True)
    assert len(await _audit_rows(db_session, user_id, "LOGIN")) == 1
    assert await _audit_rows(db_session, user_id, "OTP_FAILED") == []
