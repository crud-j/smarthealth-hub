"""
Tests for the /users endpoints.

Covers:
  - Admin can create a staff user (POST /users).
  - BHW cannot create a staff user (→ 403).
  - Any authenticated role can GET /users/me.
  - Admin can deactivate a user (DELETE /users/{id} → 204).
  - Deactivated user's refresh_token_hash is cleared.

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
async def test_admin_can_create_user(
    client: AsyncClient,
    admin_token: str,
    make_role,
) -> None:
    """Admin can POST /users and receive a UserResponse with an id."""
    # Ensure a non-admin role exists so role_id is valid
    role = await make_role("bhw")

    payload = {
        "full_name": "Test BHW Staff",
        "email": f"bhw_{uuid.uuid4().hex[:6]}@bhc.local",
        "mobile_number": "+639171234567",
        "role_id": str(role.id),
        "send_welcome_sms": False,
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
async def test_admin_can_deactivate_user(
    client: AsyncClient,
    admin_token: str,
    make_user,
    db_session: AsyncSession,
) -> None:
    """Admin can DELETE /users/{id} which soft-deactivates the user (is_active=False)."""
    # Create a BHW user to deactivate
    bhw_user: User = await make_user("bhw", email=f"deactivate_{uuid.uuid4().hex[:6]}@test.local")

    response = await client.delete(
        f"/api/v1/users/{bhw_user.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 204, response.text

    # Verify is_active is now False in the DB
    result = await db_session.execute(
        sa.select(User).where(User.id == bhw_user.id)
    )
    updated_user: User | None = result.scalar_one_or_none()
    assert updated_user is not None
    assert updated_user.is_active is False


@pytest.mark.asyncio
async def test_deactivated_user_session_cleared(
    client: AsyncClient,
    admin_token: str,
    make_user,
    db_session: AsyncSession,
) -> None:
    """Deactivating a user clears their refresh_token_hash immediately."""
    # Create a BHW user and manually set a refresh token hash
    bhw_user: User = await make_user("bhw", email=f"session_{uuid.uuid4().hex[:6]}@test.local")

    # Simulate an active session by setting a refresh_token_hash
    await db_session.execute(
        sa.update(User)
        .where(User.id == bhw_user.id)
        .values(refresh_token_hash="somefakehash1234567890abcdef")
    )
    await db_session.commit()

    # Deactivate the user
    response = await client.delete(
        f"/api/v1/users/{bhw_user.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 204, response.text

    # Verify refresh_token_hash is None (session invalidated)
    result = await db_session.execute(
        sa.select(User).where(User.id == bhw_user.id)
    )
    updated_user: User | None = result.scalar_one_or_none()
    assert updated_user is not None
    assert updated_user.is_active is False
    assert updated_user.refresh_token_hash is None
