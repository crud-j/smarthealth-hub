"""
POST /auth/change-password (Profile & Security page).

- A wrong current password is a form error (422), not 401. A 401 made the
  frontend refresh the session and retry, and when that refresh failed it
  signed the user out over a typo.
- A passkey-only account has no password to change: a clear 422 message.
- The new password must differ from the current one.
- Password rules (8+ characters, an uppercase letter, a number) are unchanged.
- At most 5 attempts per 15 minutes per account (guessing the current
  password from a signed-in session).
- A successful change is audited (PASSWORD_CHANGED) and the new password works.
"""

from __future__ import annotations

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, verify_password
from app.models.audit_log import AuditLog
from app.models.user import User

pytestmark = pytest.mark.asyncio

URL = "/api/v1/auth/change-password"
CURRENT = "Oldpass123"


async def _signed_in(make_user, **kw) -> tuple[User, dict[str, str]]:
    user = await make_user("bhw", password=CURRENT, **kw)
    return user, {
        "Authorization": f"Bearer {create_access_token(subject=str(user.id), role='bhw')}"
    }


async def test_change_password_works_and_is_audited(
    client: AsyncClient, make_user, db_session: AsyncSession
) -> None:
    user, headers = await _signed_in(make_user)

    resp = await client.post(
        URL, headers=headers, json={"current_password": CURRENT, "new_password": "Newpass456"}
    )

    assert resp.status_code == 200, resp.text
    await db_session.refresh(user)
    assert verify_password("Newpass456", user.password_hash)
    actions = (
        (await db_session.execute(sa.select(AuditLog.action).where(AuditLog.entity_id == user.id)))
        .scalars()
        .all()
    )
    assert "PASSWORD_CHANGED" in actions


async def test_wrong_current_password_is_a_form_error_not_401(
    client: AsyncClient, make_user, db_session: AsyncSession
) -> None:
    user, headers = await _signed_in(make_user)

    resp = await client.post(
        URL, headers=headers, json={"current_password": "Wrongpass1", "new_password": "Newpass456"}
    )

    assert resp.status_code == 422
    assert resp.json()["error"]["message"] == "Current password is incorrect."
    await db_session.refresh(user)
    assert verify_password(CURRENT, user.password_hash)


async def test_passkey_only_account_has_no_password_to_change(
    client: AsyncClient, make_user, db_session: AsyncSession
) -> None:
    user, headers = await _signed_in(make_user)
    user.password_hash = None
    await db_session.commit()

    resp = await client.post(
        URL, headers=headers, json={"current_password": "anything1A", "new_password": "Newpass456"}
    )

    assert resp.status_code == 422
    assert "passkey" in resp.json()["error"]["message"].lower()


async def test_new_password_must_differ(client: AsyncClient, make_user) -> None:
    _user, headers = await _signed_in(make_user)

    resp = await client.post(
        URL, headers=headers, json={"current_password": CURRENT, "new_password": CURRENT}
    )

    assert resp.status_code == 422
    assert "different" in resp.json()["error"]["message"]


@pytest.mark.parametrize("weak", ["short1A", "nouppercase1", "NoDigitsHere"])
async def test_password_rules_unchanged(client: AsyncClient, make_user, weak: str) -> None:
    _user, headers = await _signed_in(make_user)
    resp = await client.post(
        URL, headers=headers, json={"current_password": CURRENT, "new_password": weak}
    )
    assert resp.status_code == 422


async def test_attempts_are_rate_limited(client: AsyncClient, make_user) -> None:
    _user, headers = await _signed_in(make_user)
    body = {"current_password": "Wrongpass1", "new_password": "Newpass456"}

    codes = [(await client.post(URL, headers=headers, json=body)).status_code for _ in range(6)]

    assert codes[:5] == [422] * 5
    assert codes[5] == 429


async def test_needs_sign_in(client: AsyncClient) -> None:
    resp = await client.post(URL, json={"current_password": CURRENT, "new_password": "Newpass456"})
    assert resp.status_code == 401
