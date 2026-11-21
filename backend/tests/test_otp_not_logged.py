"""
A sign-in / password-reset code must never be written to the production logs.

When the OTP email is not sent (email not configured, or the SMTP call
fails) the code used to be logged so local development works without
Gmail. On the server that put live codes in `docker logs`, readable by
anyone with server access. Now the code is logged only outside production
(the same rule as mfa_service's dev:otp Redis copy).
"""

from __future__ import annotations

import logging
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import Role, User
from app.services.email_service import email_service

CODE = "482913"


def _logged_anywhere(caplog: pytest.LogCaptureFixture, text: str) -> bool:
    """True if `text` is in any captured record's message or extra fields."""
    return any(
        text in record.getMessage() or text in str(record.__dict__) for record in caplog.records
    )


@pytest.fixture
def production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")


@pytest.fixture
def email_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "EMAIL_HOST_USER", "sender@example.invalid")
    monkeypatch.setattr(settings, "EMAIL_HOST_PASSWORD", "not-a-real-password")


# ---------------------------------------------------------------------------
# email_service
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_email_not_configured_in_production_does_not_log_code(production, caplog):
    caplog.set_level(logging.DEBUG)

    with patch.object(settings, "EMAIL_HOST_USER", ""):
        sent = await email_service.send_otp_email("staff@example.invalid", CODE)

    assert sent is False
    assert caplog.records, "the failure itself must still be logged"
    assert not _logged_anywhere(caplog, CODE)


@pytest.mark.asyncio
async def test_smtp_failure_in_production_does_not_log_code(production, email_configured, caplog):
    caplog.set_level(logging.DEBUG)

    with patch("app.services.email_service._send_email_sync", side_effect=OSError("smtp down")):
        sent = await email_service.send_otp_email("staff@example.invalid", CODE)

    assert sent is False
    assert _logged_anywhere(caplog, "smtp down"), "the error must still be logged"
    assert not _logged_anywhere(caplog, CODE)


@pytest.mark.asyncio
async def test_development_still_logs_code_for_local_sign_in(monkeypatch, caplog):
    """Local dev without Gmail keeps working: the code is in the console."""
    caplog.set_level(logging.DEBUG)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")

    with patch.object(settings, "EMAIL_HOST_USER", ""):
        await email_service.send_otp_email("staff@example.invalid", CODE)

    assert _logged_anywhere(caplog, CODE)


# ---------------------------------------------------------------------------
# auth_service: login, resend, forgot password
# ---------------------------------------------------------------------------


async def _staff(db: AsyncSession, email: str) -> User:
    role = Role(id=uuid.uuid4(), name="bhw", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        id=uuid.uuid4(),
        full_name="Test BHW",
        email=email,
        mobile_number="+639170000001",
        password_hash=hash_password("TestPass1!"),
        role_id=role.id,
        is_active=True,
        mfa_enabled=True,
    )
    db.add(user)
    await db.commit()
    return user


def _fixed_otp():
    return patch(
        "app.services.mfa_service.generate_and_store_otp",
        new_callable=AsyncMock,
        return_value=CODE,
    )


@pytest.mark.asyncio
async def test_login_in_production_does_not_log_code(
    production, client: AsyncClient, db_session: AsyncSession, caplog
):
    caplog.set_level(logging.DEBUG)
    user = await _staff(db_session, "login-log@test.example.com")

    with _fixed_otp():
        resp = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "TestPass1!"}
        )

    assert resp.status_code == 200
    assert not _logged_anywhere(caplog, CODE)


@pytest.mark.asyncio
async def test_resend_in_production_does_not_log_code(
    production, client: AsyncClient, db_session: AsyncSession, caplog
):
    caplog.set_level(logging.DEBUG)
    user = await _staff(db_session, "resend-log@test.example.com")

    with _fixed_otp():
        resp = await client.post("/api/v1/auth/resend-otp", json={"user_id": str(user.id)})

    assert resp.status_code == 200
    assert not _logged_anywhere(caplog, CODE)


@pytest.mark.asyncio
async def test_forgot_password_in_production_does_not_log_code(
    production, client: AsyncClient, db_session: AsyncSession, caplog
):
    caplog.set_level(logging.DEBUG)
    user = await _staff(db_session, "reset-log@test.example.com")

    with _fixed_otp():
        resp = await client.post("/api/v1/auth/forgot-password", json={"email": user.email})

    assert resp.status_code == 200
    assert not _logged_anywhere(caplog, CODE)
