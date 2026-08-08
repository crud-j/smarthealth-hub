"""
FIDO2/WebAuthn passkey endpoint tests — Prompt 15C.

Test database: ``smarthealthhub_test`` (configured in conftest.py).
Each test runs inside a SAVEPOINT that rolls back after the test, so the DB
is always clean between tests without dropping/recreating tables.

Async mode: configured in pyproject.toml as ``asyncio_mode = "auto"`` —
every coroutine test function runs automatically without @pytest.mark.asyncio.

Covered scenarios:
  - list credentials: empty list when user has no passkeys
  - register/begin: 401 when unauthenticated
  - register/begin: 200 + challenge dict when authenticated (Redis mocked)
  - register/complete: 422 when credential payload is not a dict
  - authenticate/begin: 401 for unknown email (no user-enumeration leak)
  - authenticate/begin: 401 for user with no active passkeys
  - revoke credential: 204 + row soft-deleted in DB
  - IDOR guard: cannot revoke another user's credential → 404
  - audit log: PASSKEY_REVOKED row written on successful revoke
"""

from __future__ import annotations

import secrets
import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.audit_log import AuditLog
from app.models.passkey_credential import PasskeyCredential
from app.models.user import Role, User

# ---------------------------------------------------------------------------
# URL constants
# ---------------------------------------------------------------------------

REGISTER_BEGIN_URL = "/api/v1/auth/passkey/register/begin"
REGISTER_COMPLETE_URL = "/api/v1/auth/passkey/register/complete"
AUTH_BEGIN_URL = "/api/v1/auth/passkey/authenticate/begin"
AUTH_COMPLETE_URL = "/api/v1/auth/passkey/authenticate/complete"
CREDENTIALS_URL = "/api/v1/auth/passkey/credentials"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _ensure_bhw_role(db_session: AsyncSession) -> Role:
    """
    Return the 'bhw' Role, creating it if it does not exist in this test's
    SAVEPOINT scope.
    """
    result = await db_session.execute(select(Role).where(Role.name == "bhw"))
    role: Role | None = result.scalar_one_or_none()
    if role is None:
        role = Role(id=uuid.uuid4(), name="bhw", permissions={})
        db_session.add(role)
        await db_session.flush()
    return role


async def _make_passkey_user(
    db_session: AsyncSession,
    email: str | None = None,
) -> User:
    """
    Insert a User row suitable for passkey tests (mfa_enabled=True).
    Uses make_user/make_role pattern inline for isolation.
    """
    role = await _ensure_bhw_role(db_session)
    resolved_email = email or f"pk_{uuid.uuid4().hex[:8]}@test.local"
    mobile_suffix = abs(hash(resolved_email)) % 100000
    user = User(
        id=uuid.uuid4(),
        full_name="Passkey Test User",
        email=resolved_email,
        mobile_number=f"+6391700{mobile_suffix:05d}",
        password_hash=hash_password("Test@2026!"),
        role_id=role.id,
        is_active=True,
        mfa_enabled=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _add_credential(
    db_session: AsyncSession,
    user: User,
    *,
    device_name: str = "Test Device",
) -> PasskeyCredential:
    """
    Insert a fake-but-structurally-valid PasskeyCredential for the given user.
    """
    cred = PasskeyCredential(
        user_id=user.id,
        credential_id=secrets.token_bytes(32),
        public_key=secrets.token_bytes(77),
        sign_count=0,
        device_name=device_name,
        is_active=True,
    )
    db_session.add(cred)
    await db_session.flush()
    return cred


# ---------------------------------------------------------------------------
# Test: GET /auth/passkey/credentials — list passkeys
# ---------------------------------------------------------------------------


async def test_list_credentials_empty(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    GET /auth/passkey/credentials returns an empty list when the user has no
    active passkey registrations.
    """
    user = await _make_passkey_user(db_session)
    await db_session.commit()

    token = create_access_token(subject=str(user.id), role="bhw")
    resp = await client.get(CREDENTIALS_URL, headers=auth_headers(token))

    assert resp.status_code == 200
    data = resp.json()
    assert "credentials" in data
    assert data["credentials"] == []


async def test_list_credentials_returns_registered_passkey(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    GET /auth/passkey/credentials returns one item after a credential is seeded.
    """
    user = await _make_passkey_user(db_session)
    cred = await _add_credential(db_session, user, device_name="My Laptop")
    await db_session.commit()

    token = create_access_token(subject=str(user.id), role="bhw")
    resp = await client.get(CREDENTIALS_URL, headers=auth_headers(token))

    assert resp.status_code == 200
    items = resp.json()["credentials"]
    assert len(items) == 1
    assert items[0]["device_name"] == "My Laptop"
    assert str(cred.id) == items[0]["id"]


async def test_list_credentials_requires_auth(
    client: AsyncClient,
) -> None:
    """
    GET /auth/passkey/credentials returns 401 when no JWT is provided.
    """
    resp = await client.get(CREDENTIALS_URL)
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Test: POST /auth/passkey/register/begin
# ---------------------------------------------------------------------------


async def test_register_begin_requires_auth(
    client: AsyncClient,
) -> None:
    """
    POST /auth/passkey/register/begin returns 401 when called without a JWT.
    """
    resp = await client.post(
        REGISTER_BEGIN_URL,
        json={"device_name": "Test Device"},
    )
    assert resp.status_code == 401


async def test_register_begin_authenticated_returns_challenge(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    POST /auth/passkey/register/begin with a valid JWT returns 200 and a
    JSON dict containing a 'challenge' key inside 'options'.

    Redis is mocked so this test does not require a live Redis instance.
    """
    user = await _make_passkey_user(db_session)
    await db_session.commit()

    token = create_access_token(subject=str(user.id), role="bhw")

    with patch(
        "app.services.passkey_service._set_redis_challenge",
        new_callable=AsyncMock,
    ):
        resp = await client.post(
            REGISTER_BEGIN_URL,
            json={"device_name": "My Phone"},
            headers=auth_headers(token),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "options" in data
    assert "challenge" in data["options"]


# ---------------------------------------------------------------------------
# Test: POST /auth/passkey/register/complete
# ---------------------------------------------------------------------------


async def test_register_complete_invalid_credential_shape_returns_422(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    POST /auth/passkey/register/complete with a non-dict 'credential' field
    violates the Pydantic schema and must return 422 Unprocessable Entity.
    """
    user = await _make_passkey_user(db_session)
    await db_session.commit()

    token = create_access_token(subject=str(user.id), role="bhw")
    resp = await client.post(
        REGISTER_COMPLETE_URL,
        json={"credential": "not-a-dict", "device_name": "Test"},
        headers=auth_headers(token),
    )

    assert resp.status_code == 422


async def test_register_complete_requires_auth(
    client: AsyncClient,
) -> None:
    """
    POST /auth/passkey/register/complete returns 401 when called without a JWT.
    """
    resp = await client.post(
        REGISTER_COMPLETE_URL,
        json={"credential": {}, "device_name": "Test"},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Test: POST /auth/passkey/authenticate/begin
# ---------------------------------------------------------------------------


async def test_authenticate_begin_unknown_email_returns_401(
    client: AsyncClient,
) -> None:
    """
    POST /auth/passkey/authenticate/begin with an e-mail address that does not
    exist in the database returns 401.  The error message must not leak
    'user' or 'not found' to prevent user-enumeration attacks.
    """
    resp = await client.post(
        AUTH_BEGIN_URL,
        json={"email": "nobody@nowhere.invalid"},
    )

    assert resp.status_code == 401
    body = resp.json()
    # FastAPI wraps HTTPException detail in {"detail": "..."}.
    detail = body.get("detail", "")
    assert "not found" not in detail.lower()
    assert "user" not in detail.lower()


async def test_authenticate_begin_user_has_no_passkeys_returns_401(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    POST /auth/passkey/authenticate/begin for a known user who has registered no
    active passkeys should return 401 with a message mentioning 'No passkeys'.
    """
    user = await _make_passkey_user(db_session)
    await db_session.commit()

    resp = await client.post(
        AUTH_BEGIN_URL,
        json={"email": user.email},
    )

    assert resp.status_code == 401
    body = resp.json()
    detail = body.get("detail", "")
    assert "No passkeys" in detail


async def test_authenticate_begin_with_credential_returns_challenge(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    POST /auth/passkey/authenticate/begin for a user who has an active passkey
    returns 200 + a JSON dict with a 'challenge' key inside 'options'.

    Redis is mocked to avoid needing a live Redis connection.
    """
    user = await _make_passkey_user(db_session)
    await _add_credential(db_session, user)
    await db_session.commit()

    with patch(
        "app.services.passkey_service._set_redis_challenge",
        new_callable=AsyncMock,
    ):
        resp = await client.post(
            AUTH_BEGIN_URL,
            json={"email": user.email},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "options" in data
    assert "challenge" in data["options"]


# ---------------------------------------------------------------------------
# Test: DELETE /auth/passkey/credentials/{id} — revoke a passkey
# ---------------------------------------------------------------------------


async def test_revoke_own_credential_returns_204(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    DELETE /auth/passkey/credentials/{id} — owner can revoke their own credential.
    Response is 204 No Content and the row is soft-deleted (is_active=False).
    """
    user = await _make_passkey_user(db_session)
    cred = await _add_credential(db_session, user)
    await db_session.commit()

    token = create_access_token(subject=str(user.id), role="bhw")
    resp = await client.delete(
        f"{CREDENTIALS_URL}/{cred.id}",
        headers=auth_headers(token),
    )

    assert resp.status_code == 204

    # Verify the row is now soft-deleted.
    await db_session.refresh(cred)
    assert cred.is_active is False


async def test_revoke_credential_requires_auth(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    DELETE /auth/passkey/credentials/{id} returns 401 when called without a JWT.
    """
    user = await _make_passkey_user(db_session)
    cred = await _add_credential(db_session, user)
    await db_session.commit()

    resp = await client.delete(f"{CREDENTIALS_URL}/{cred.id}")
    assert resp.status_code == 401


async def test_revoke_nonexistent_credential_returns_404(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    DELETE /auth/passkey/credentials/{id} returns 404 when the UUID does not
    match any credential (no information leakage about other users' IDs).
    """
    user = await _make_passkey_user(db_session)
    await db_session.commit()

    token = create_access_token(subject=str(user.id), role="bhw")
    resp = await client.delete(
        f"{CREDENTIALS_URL}/{uuid.uuid4()}",
        headers=auth_headers(token),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Test: IDOR guard — cannot revoke another user's credential
# ---------------------------------------------------------------------------


async def test_revoke_other_users_credential_is_404(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    DELETE /auth/passkey/credentials/{id} — a user authenticated as 'other_user'
    cannot revoke a credential that belongs to 'owner_user'.

    The service raises NotFoundError (credential not found for the requesting
    user) so the response is 404, not 403.  This prevents confirming that a
    credential ID exists for a different user.

    After the failed request the credential must still be active.
    """
    owner_user = await _make_passkey_user(
        db_session,
        email=f"owner_{uuid.uuid4().hex[:6]}@test.local",
    )
    cred = await _add_credential(db_session, owner_user)

    other_user = await _make_passkey_user(
        db_session,
        email=f"other_{uuid.uuid4().hex[:6]}@test.local",
    )
    await db_session.commit()

    other_token = create_access_token(subject=str(other_user.id), role="bhw")
    resp = await client.delete(
        f"{CREDENTIALS_URL}/{cred.id}",
        headers=auth_headers(other_token),
    )

    # 404 — service raises NotFoundError because the credential is not owned
    # by other_user; this deliberately does not leak the credential's existence.
    assert resp.status_code == 404

    # Credential must remain active.
    await db_session.refresh(cred)
    assert cred.is_active is True


# ---------------------------------------------------------------------------
# Test: audit log written on revoke
# ---------------------------------------------------------------------------


async def test_revoke_writes_passkey_revoked_audit_log(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    Revoking a passkey creates a PASSKEY_REVOKED audit log row linked to the
    revoking user's ID.  The metadata must reference the revoked credential ID.
    """
    user = await _make_passkey_user(db_session)
    cred = await _add_credential(db_session, user)
    await db_session.commit()

    token = create_access_token(subject=str(user.id), role="bhw")
    resp = await client.delete(
        f"{CREDENTIALS_URL}/{cred.id}",
        headers=auth_headers(token),
    )
    assert resp.status_code == 204

    # The audit_service stores metadata in the ``metadata_`` mapped attribute
    # (Python name) which maps to the DB column named ``metadata``.
    audit_result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.user_id == user.id,
            AuditLog.action == "PASSKEY_REVOKED",
        )
    )
    audit_row: AuditLog | None = audit_result.scalar_one_or_none()
    assert audit_row is not None, "Expected a PASSKEY_REVOKED audit log row."

    # metadata_ is a dict; confirm the credential UUID appears in it.
    assert str(cred.id) in str(audit_row.metadata_)
