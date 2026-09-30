"""
Tests for the /users endpoints.

Covers:
  - Admin can create a staff user (password mode) (POST /users → 201).
  - Admin can create a staff user (passkey mode) (POST /users → 201, has_password=False).
  - POST /users with credential_mode="password" and no password returns 422.
  - BHW cannot create a staff user (→ 403).
  - Any authenticated role can GET /users/me.
  - Admin can hard-delete a user (DELETE /users/{id} → 204; row gone from DB).
  - Admin cannot delete their own account (→ 400).
  - BHW cannot delete a user (→ 403).

Fixtures from conftest.py:
  client, admin_token, bhw_token, make_user, make_role, db_session
"""

from __future__ import annotations

import uuid

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


@pytest.mark.asyncio
async def test_admin_can_create_user_password_mode(
    client: AsyncClient,
    admin_token: str,
    make_role,
) -> None:
    """Admin can POST /users with credential_mode='password' and get a UserResponse."""
    role = await make_role("bhw")

    payload = {
        "full_name": "Test BHW Staff",
        "email": f"bhw_{uuid.uuid4().hex[:6]}@bhc.local",
        "mobile_number": "+639171234567",
        "role_id": str(role.id),
        "send_welcome_sms": False,
        "credential_mode": "password",
        "password": "SecurePass1!",
    }

    response = await client.post(
        "/api/v1/users",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert "id" in body
    assert body["email"] == payload["email"]
    assert body["role"] == "bhw"
    assert body["is_active"] is True
    assert body["mfa_enabled"] is True
    assert body["has_password"] is True


@pytest.mark.asyncio
async def test_admin_can_create_user_passkey_mode(
    client: AsyncClient,
    admin_token: str,
    make_role,
) -> None:
    """Admin can POST /users with credential_mode='passkey'; has_password is False."""
    role = await make_role("bhw")

    payload = {
        "full_name": "Passkey Only Staff",
        "email": f"passkey_{uuid.uuid4().hex[:6]}@bhc.local",
        "mobile_number": "+639171234560",
        "role_id": str(role.id),
        "send_welcome_sms": False,
        "credential_mode": "passkey",
    }

    response = await client.post(
        "/api/v1/users",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert "id" in body
    assert body["role"] == "bhw"
    assert body["is_active"] is True
    assert body["has_password"] is False


@pytest.mark.asyncio
async def test_create_user_password_mode_without_password_returns_422(
    client: AsyncClient,
    admin_token: str,
    make_role,
) -> None:
    """POST /users with credential_mode='password' but no password field returns 422."""
    role = await make_role("bhw")

    payload = {
        "full_name": "Missing Password Staff",
        "email": f"missingpw_{uuid.uuid4().hex[:6]}@bhc.local",
        "mobile_number": "+639171234561",
        "role_id": str(role.id),
        "send_welcome_sms": False,
        "credential_mode": "password",
        # password intentionally omitted
    }

    response = await client.post(
        "/api/v1/users",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_bhw_cannot_create_user(
    client: AsyncClient,
    bhw_token: str,
    make_role,
) -> None:
    """BHW role is forbidden from creating staff accounts (→ 403)."""
    role = await make_role("bhw")

    payload = {
        "full_name": "Attempted Create",
        "email": f"bhw_{uuid.uuid4().hex[:6]}@bhc.local",
        "mobile_number": "+639171234568",
        "role_id": str(role.id),
        "send_welcome_sms": False,
        "credential_mode": "passkey",
    }

    response = await client.post(
        "/api/v1/users",
        json=payload,
        headers={"Authorization": f"Bearer {bhw_token}"},
    )

    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_any_role_can_get_me(
    client: AsyncClient,
    admin_token: str,
    bhw_token: str,
) -> None:
    """Both admin and BHW tokens can successfully call GET /users/me."""
    # Admin
    resp_admin = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp_admin.status_code == 200, resp_admin.text
    body_admin = resp_admin.json()
    assert "id" in body_admin
    assert "email" in body_admin
    assert body_admin["role"] == "admin"

    # BHW
    resp_bhw = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {bhw_token}"},
    )
    assert resp_bhw.status_code == 200, resp_bhw.text
    body_bhw = resp_bhw.json()
    assert body_bhw["role"] == "bhw"


@pytest.mark.asyncio
async def test_admin_can_delete_user(
    client: AsyncClient,
    admin_token: str,
    make_user,
    db_session: AsyncSession,
) -> None:
    """Admin can DELETE /users/{id} — user row is permanently removed (204, then 404)."""
    target: User = await make_user("bhw", email=f"delete_{uuid.uuid4().hex[:6]}@test.local")
    target_id = target.id

    response = await client.delete(
        f"/api/v1/users/{target_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 204, response.text

    # Row must be gone from the database
    db_session.expire_all()
    result = await db_session.execute(
        sa.select(User).where(User.id == target_id)
    )
    deleted_user: User | None = result.scalar_one_or_none()
    assert deleted_user is None, "User row must be fully removed after hard delete."

    # Follow-up GET must return 404
    get_response = await client.get(
        f"/api/v1/users/{target_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert get_response.status_code == 404, get_response.text


@pytest.mark.asyncio
async def test_admin_cannot_delete_own_account(
    client: AsyncClient,
    admin_token: str,
    db_session: AsyncSession,
) -> None:
    """Admin cannot delete their own account — returns 400."""
    # Resolve the admin's own user ID from /users/me
    me_response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert me_response.status_code == 200, me_response.text
    admin_id = me_response.json()["id"]

    response = await client.delete(
        f"/api/v1/users/{admin_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400, response.text
    assert "cannot delete your own account" in response.json()["detail"].lower()

    # Admin row must still exist
    result = await db_session.execute(
        sa.select(User).where(User.id == uuid.UUID(admin_id))
    )
    assert result.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_non_admin_cannot_delete_user(
    client: AsyncClient,
    bhw_token: str,
    make_user,
) -> None:
    """BHW role cannot delete staff accounts — returns 403."""
    target: User = await make_user("bhw", email=f"bhw_nodelete_{uuid.uuid4().hex[:6]}@test.local")

    response = await client.delete(
        f"/api/v1/users/{target.id}",
        headers={"Authorization": f"Bearer {bhw_token}"},
    )
    assert response.status_code == 403, response.text
