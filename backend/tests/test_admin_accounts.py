"""
System Administrator accounts from the Users page.

Admins can now create another Admin with "Add Staff Account" (before, only
the seed script could). GET /users/roles keeps leaving Admin out by default
(the Edit form and other dropdowns); the Add form asks for it with
?include_admin=true, which only an admin may do.

Guards so the system never ends up without an administrator:
  - an admin cannot change their own role;
  - the last active admin cannot be moved to another role or deactivated.
(The Edit form used to demote an admin whenever it was saved: its role list
had no Admin, so it pre-selected another role. The frontend fix is in
EditUserModal; these guards are the backend safety net.)
"""

from __future__ import annotations

import uuid

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.models.user import Role, User
from app.schemas.user import UserUpdate
from app.services import user_service

pytestmark = pytest.mark.asyncio


async def _signed_in(make_user, role: str) -> tuple[User, dict[str, str]]:
    user = await make_user(role)
    return user, {"Authorization": f"Bearer {create_access_token(subject=str(user.id), role=role)}"}


async def test_roles_list_leaves_admin_out_by_default(
    client: AsyncClient, make_user, make_role
) -> None:
    await make_role("admin")
    await make_role("bhw")
    _admin, headers = await _signed_in(make_user, "admin")

    names = [r["name"] for r in (await client.get("/api/v1/users/roles", headers=headers)).json()]

    assert "admin" not in names
    assert "bhw" in names


async def test_admin_can_ask_for_the_admin_role(client: AsyncClient, make_user, make_role) -> None:
    await make_role("bhw")
    _admin, headers = await _signed_in(make_user, "admin")

    resp = await client.get("/api/v1/users/roles?include_admin=true", headers=headers)

    assert resp.status_code == 200
    names = [r["name"] for r in resp.json()]
    assert "admin" in names and "bhw" in names


@pytest.mark.parametrize("role", ["bhw", "physician", "admin_staff"])
async def test_only_admins_may_ask_for_the_admin_role(
    client: AsyncClient, make_user, role: str
) -> None:
    _user, headers = await _signed_in(make_user, role)
    resp = await client.get("/api/v1/users/roles?include_admin=true", headers=headers)
    assert resp.status_code == 403


async def test_admin_creates_another_admin(
    client: AsyncClient, make_user, make_role, db_session: AsyncSession
) -> None:
    creator, headers = await _signed_in(make_user, "admin")
    admin_role = await make_role("admin")
    email = f"second_admin_{uuid.uuid4().hex[:6]}@test.local"

    resp = await client.post(
        "/api/v1/users",
        headers=headers,
        json={
            "full_name": "Second Administrator",
            "email": email,
            "mobile_number": "+639170000123",
            "role_id": str(admin_role.id),
            "send_welcome_sms": False,
            "credential_mode": "password",
            "password": "Secondadmin1",
        },
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["role"] == "admin"
    assert resp.json()["is_active"] is True
    new_id = uuid.UUID(resp.json()["id"])
    audit = (
        (await db_session.execute(sa.select(AuditLog).where(AuditLog.entity_id == new_id)))
        .scalars()
        .all()
    )
    assert [(a.action, a.user_id, a.metadata_["role"]) for a in audit] == [
        ("CREATE", creator.id, "admin")
    ]
    # The creator is still an admin.
    await db_session.refresh(creator, attribute_names=["role"])
    assert creator.role.name == "admin"


async def test_admin_cannot_change_own_role(client: AsyncClient, make_user, make_role) -> None:
    admin, headers = await _signed_in(make_user, "admin")
    await make_user("admin")  # not the last admin: the self rule alone blocks it
    bhw_role = await make_role("bhw")

    resp = await client.put(
        f"/api/v1/users/{admin.id}", headers=headers, json={"role_id": str(bhw_role.id)}
    )

    assert resp.status_code == 409
    assert "your own role" in resp.text


async def test_admin_cannot_deactivate_self(client: AsyncClient, make_user) -> None:
    admin, headers = await _signed_in(make_user, "admin")
    await make_user("admin")

    resp = await client.put(f"/api/v1/users/{admin.id}", headers=headers, json={"is_active": False})

    assert resp.status_code == 409
    assert "your own account" in resp.text


async def test_service_never_removes_the_last_active_admin(
    make_user, make_role, db_session: AsyncSession
) -> None:
    # Through the API the acting admin is always an active admin, so the last
    # one can only be yourself (blocked above). The service also refuses on
    # its own, for any other caller (scripts, future endpoints).
    only_admin = await make_user("admin")
    others = (
        (
            await db_session.execute(
                sa.select(User).join(Role).where(Role.name == "admin", User.id != only_admin.id)
            )
        )
        .scalars()
        .all()
    )
    for row in others:
        row.is_active = False
    await db_session.commit()
    bhw_role = await make_role("bhw")
    someone_else = uuid.uuid4()

    with pytest.raises(ConflictError, match="last active System Administrator"):
        await user_service.update_user(
            db_session, only_admin.id, UserUpdate(role_id=bhw_role.id), updated_by=someone_else
        )
    with pytest.raises(ConflictError, match="last active System Administrator"):
        await user_service.update_user(
            db_session, only_admin.id, UserUpdate(is_active=False), updated_by=someone_else
        )
    await db_session.refresh(only_admin, attribute_names=["role"])
    assert only_admin.role.name == "admin" and only_admin.is_active


async def test_one_of_two_admins_can_be_moved(
    client: AsyncClient, make_user, make_role, db_session: AsyncSession
) -> None:
    _acting, headers = await _signed_in(make_user, "admin")
    other = await make_user("admin")
    bhw_role = await make_role("bhw")

    resp = await client.put(
        f"/api/v1/users/{other.id}", headers=headers, json={"role_id": str(bhw_role.id)}
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "bhw"


async def test_editing_an_admins_name_keeps_the_role(
    client: AsyncClient, make_user, db_session: AsyncSession
) -> None:
    _acting, headers = await _signed_in(make_user, "admin")
    other = await make_user("admin")

    resp = await client.put(
        f"/api/v1/users/{other.id}", headers=headers, json={"full_name": "Renamed Administrator"}
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "admin"
    assert resp.json()["full_name"] == "Renamed Administrator"
