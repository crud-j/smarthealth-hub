"""
Tests for "sign out everywhere" token revocation (app.core.security).

DB-free: uses fakeredis, so it runs with ``--noconftest`` on any PC.

``revoke_all_user_tokens`` stores the revocation time; access tokens whose
``iat`` is from an earlier second are rejected. Before this change the marker
was written but never checked, so it had no effect.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import fakeredis
import pytest
from jose import jwt
from redis.exceptions import ConnectionError as RedisConnectionError

from app.core import security
from app.core.config import settings
from app.core.exceptions import UnauthorizedError

USER_ID = "7d3c1a6e-2a43-4d4a-9a0b-0d7f7f6c1b11"


@pytest.fixture
def redis(monkeypatch: pytest.MonkeyPatch) -> fakeredis.FakeAsyncRedis:
    fake = fakeredis.FakeAsyncRedis(decode_responses=True)
    monkeypatch.setattr(security, "_get_redis", lambda: fake)
    return fake


@pytest.mark.asyncio
async def test_token_issued_before_revocation_is_revoked(redis: fakeredis.FakeAsyncRedis) -> None:
    issued = int(time.time()) - 60
    await security.revoke_all_user_tokens(USER_ID)
    assert await security.is_user_session_revoked(USER_ID, issued) is True


@pytest.mark.asyncio
async def test_token_issued_after_revocation_is_allowed(redis: fakeredis.FakeAsyncRedis) -> None:
    await security.revoke_all_user_tokens(USER_ID)
    assert await security.is_user_session_revoked(USER_ID, int(time.time()) + 1) is False


@pytest.mark.asyncio
async def test_other_users_are_not_affected(redis: fakeredis.FakeAsyncRedis) -> None:
    await security.revoke_all_user_tokens(USER_ID)
    other = "00000000-0000-4000-8000-000000000000"
    assert await security.is_user_session_revoked(other, int(time.time()) - 60) is False


@pytest.mark.asyncio
async def test_no_marker_means_not_revoked(redis: fakeredis.FakeAsyncRedis) -> None:
    assert await security.is_user_session_revoked(USER_ID, int(time.time()) - 60) is False


@pytest.mark.asyncio
async def test_marker_lasts_as_long_as_a_refresh_token(redis: fakeredis.FakeAsyncRedis) -> None:
    await security.revoke_all_user_tokens(USER_ID)
    ttl = await redis.ttl(f"revoked:user:{USER_ID}")
    assert 0 < ttl <= settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600


@pytest.mark.asyncio
async def test_old_style_marker_is_ignored(redis: fakeredis.FakeAsyncRedis) -> None:
    """Markers written by the old code held "1"; they must not lock anyone out."""
    await redis.set(f"revoked:user:{USER_ID}", "1")
    assert await security.is_user_session_revoked(USER_ID, int(time.time()) - 60) is False


@pytest.mark.asyncio
async def test_redis_down_allows_the_token(monkeypatch: pytest.MonkeyPatch) -> None:
    """Same fail-open rule as the JTI blocklist; refresh tokens are cleared in the DB anyway."""

    class Broken:
        async def get(self, key: str) -> None:
            raise RedisConnectionError("down")

    monkeypatch.setattr(security, "_get_redis", lambda: Broken())
    assert await security.is_user_session_revoked(USER_ID, 0) is False


@pytest.mark.asyncio
async def test_get_current_user_rejects_a_revoked_session(
    redis: fakeredis.FakeAsyncRedis,
) -> None:
    """The check runs before the DB lookup, so no database is needed here."""
    now = datetime.now(tz=UTC)
    token = jwt.encode(
        {
            "sub": USER_ID,
            "role": "bhw",
            "type": "access",
            "jti": "j-1",
            "iat": now - timedelta(minutes=5),
            "exp": now + timedelta(minutes=10),
        },
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    await security.revoke_all_user_tokens(USER_ID)

    with pytest.raises(UnauthorizedError, match="signed out"):
        await security.get_current_user(token=token, db=None)  # type: ignore[arg-type]
