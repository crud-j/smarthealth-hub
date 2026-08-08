"""
Tests for the /audit-logs endpoint.

Covers:
  - Admin can retrieve paginated audit logs (GET /audit-logs → 200).
  - BHW gets 403 on GET /audit-logs.
  - action filter returns only matching rows.
  - audit_logs rows cannot be updated or deleted (DB immutability rule from
    migration 0008_audit_log_immutable — DO INSTEAD NOTHING).

Fixtures from conftest.py:
  client, admin_token, bhw_token, db_session
"""

from __future__ import annotations

import uuid

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def _insert_audit_log(
    db: AsyncSession,
    *,
    action: str = "CREATE",
    entity_type: str = "patient",
) -> AuditLog:
    """Helper: insert a direct AuditLog row (bypasses the service layer)."""
    log = AuditLog(
        id=uuid.uuid4(),
        user_id=None,
        action=action,
        entity_type=entity_type,
        entity_id=uuid.uuid4(),
        metadata_={},
        ip_address="127.0.0.1",
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log


@pytest.mark.asyncio
async def test_admin_can_list_audit_logs(
    client: AsyncClient,
    admin_token: str,
    db_session: AsyncSession,
) -> None:
    """Admin can GET /audit-logs and receives items + total in response."""
    # Insert at least one log entry so the list is non-empty
    await _insert_audit_log(db_session, action="LOGIN", entity_type="user")

    response = await client.get(
        "/api/v1/audit-logs",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert "items" in body
    assert "total" in body
    assert isinstance(body["items"], list)
    assert body["total"] >= 1


@pytest.mark.asyncio
async def test_bhw_cannot_list_audit_logs(
    client: AsyncClient,
    bhw_token: str,
) -> None:
    """BHW role is forbidden from accessing audit logs (→ 403)."""
    response = await client.get(
        "/api/v1/audit-logs",
        headers={"Authorization": f"Bearer {bhw_token}"},
    )
    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_action_filter(
    client: AsyncClient,
    admin_token: str,
    db_session: AsyncSession,
) -> None:
    """GET /audit-logs?action=DELETE returns only DELETE entries."""
    # Insert one DELETE and one CREATE entry
    await _insert_audit_log(db_session, action="DELETE", entity_type="patient")
    await _insert_audit_log(db_session, action="CREATE", entity_type="patient")

    response = await client.get(
        "/api/v1/audit-logs?action=DELETE",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert "items" in body

    for item in body["items"]:
        assert item["action"] == "DELETE", (
            f"Expected action=DELETE but got action={item['action']!r}"
        )


@pytest.mark.asyncio
async def test_audit_log_immutable(
    db_session: AsyncSession,
) -> None:
    """
    Verify that audit_logs rows cannot be updated or deleted.

    The DB-level DO INSTEAD NOTHING rules (from migration 0008) make UPDATE
    and DELETE silently no-ops rather than raising an error.  This test
    inserts a row, attempts to modify and delete it, and asserts the row
    is unchanged and still present afterward.

    Note: If migration 0008 has not been applied to the test DB, UPDATE/DELETE
    will succeed and the test will catch the regression.
    """
    log = await _insert_audit_log(
        db_session, action="VIEW_PHI", entity_type="medical_history"
    )
    original_action = log.action
    log_id = log.id

    # Attempt UPDATE — should be silently ignored by the DB rule
    await db_session.execute(
        sa.text(
            "UPDATE audit_logs SET action = 'TAMPERED' WHERE id = :id"
        ).bindparams(id=log_id)
    )
    await db_session.commit()

    # Row should still have the original action
    result = await db_session.execute(
        sa.select(AuditLog).where(AuditLog.id == log_id)
    )
    row = result.scalar_one_or_none()
    assert row is not None, "Audit log row was unexpectedly deleted during UPDATE test."
    assert row.action == original_action, (
        f"Audit log action was mutated: expected {original_action!r}, got {row.action!r}. "
        "Migration 0008 (audit log immutability) may not have been applied."
    )

    # Attempt DELETE — should be silently ignored by the DB rule
    await db_session.execute(
        sa.text("DELETE FROM audit_logs WHERE id = :id").bindparams(id=log_id)
    )
    await db_session.commit()

    # Row should still exist
    result2 = await db_session.execute(
        sa.select(AuditLog).where(AuditLog.id == log_id)
    )
    row2 = result2.scalar_one_or_none()
    assert row2 is not None, (
        "Audit log row was deleted — migration 0008 immutability rule is not active."
    )
