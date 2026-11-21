"""
Mass record-viewing alert (audit_anomaly_service.check_phi_view_burst).

Patient, visit and medical-history reads write action "VIEW_PHI". The alert
used to count only "PHI_VIEW" (written by one place: the card full-verify),
so it ignored almost every record view. It now counts "VIEW_PHI", plus the
legacy "PHI_VIEW" rows already stored, and the card full-verify writes
"VIEW_PHI" like everything else.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from httpx import AsyncClient

from app.models.audit_log import AuditLog
from app.services.audit_anomaly_service import (
    PHI_VIEW_BURST_THRESHOLD,
    check_phi_view_burst,
)
from app.services.qr_service import build_qr_url
from tests.test_health_cards import _register_patient


async def _views(db_session, n: int, *, user_id: uuid.UUID, action="VIEW_PHI", minutes_ago=1):
    at = datetime.now(UTC) - timedelta(minutes=minutes_ago)
    for _ in range(n):
        db_session.add(
            AuditLog(
                id=uuid.uuid4(),
                user_id=user_id,
                action=action,
                entity_type="patient",
                entity_id=uuid.uuid4(),
                created_at=at,
            )
        )
    await db_session.commit()


def test_threshold_is_fifty():
    assert PHI_VIEW_BURST_THRESHOLD == 50


async def test_record_views_over_threshold_are_flagged(db_session):
    user = uuid.uuid4()
    await _views(db_session, PHI_VIEW_BURST_THRESHOLD + 1, user_id=user)

    events = await check_phi_view_burst(db_session)

    assert len(events) == 1
    assert events[0].check_name == "phi_view_burst"
    assert events[0].severity == "HIGH"
    assert str(user) in events[0].detail
    assert str(PHI_VIEW_BURST_THRESHOLD + 1) in events[0].detail


async def test_threshold_itself_is_not_flagged(db_session):
    await _views(db_session, PHI_VIEW_BURST_THRESHOLD, user_id=uuid.uuid4())

    assert await check_phi_view_burst(db_session) == []


async def test_legacy_phi_view_rows_still_count(db_session):
    user = uuid.uuid4()
    await _views(db_session, 30, user_id=user, action="VIEW_PHI")
    await _views(db_session, 21, user_id=user, action="PHI_VIEW")

    events = await check_phi_view_burst(db_session)

    assert len(events) == 1
    assert "51" in events[0].detail


async def test_users_are_counted_separately(db_session):
    await _views(db_session, 30, user_id=uuid.uuid4())
    await _views(db_session, 30, user_id=uuid.uuid4())

    assert await check_phi_view_burst(db_session) == []


async def test_views_older_than_an_hour_are_ignored(db_session):
    await _views(db_session, PHI_VIEW_BURST_THRESHOLD + 1, user_id=uuid.uuid4(), minutes_ago=61)

    assert await check_phi_view_burst(db_session) == []


async def test_card_full_verify_writes_view_phi(
    client: AsyncClient, bhw_token: str, db_session
) -> None:
    patient = await _register_patient(client, bhw_token)
    headers = {"Authorization": f"Bearer {bhw_token}"}
    resp = await client.post(f"/api/v1/health-cards/{patient['id']}/generate", headers=headers)
    assert resp.status_code == 201, resp.text

    verify = await client.post(
        "/api/v1/health-cards/verify",
        params={"full": "true"},
        json={"qr_payload": build_qr_url(patient["id"], 1)},
        headers=headers,
    )
    assert verify.status_code == 200, verify.text

    actions = (
        (
            await db_session.execute(
                sa.select(AuditLog.action).where(
                    AuditLog.entity_type == "patient",
                    AuditLog.entity_id == uuid.UUID(patient["id"]),
                    AuditLog.action.in_(("VIEW_PHI", "PHI_VIEW")),
                )
            )
        )
        .scalars()
        .all()
    )
    assert "VIEW_PHI" in actions
    assert "PHI_VIEW" not in actions
