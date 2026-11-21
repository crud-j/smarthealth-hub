"""
Brute-force alert (audit_anomaly_service.check_login_failure_burst).

The scan runs once an hour (Celery Beat, :30). It must therefore look at the
whole last hour; a 5-minute window only ever saw failures from :25 to :30.
Wrong OTP codes (OTP_FAILED, recorded since #41) count as well as wrong
passwords (LOGIN_FAILED).

One person on one account is held to 5 wrong passwords per 15 minutes by the
login rate limit (= 20 an hour), so more than 20 failures from one IP in an
hour means several accounts or both password and OTP guessing.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.models.audit_log import AuditLog
from app.services.audit_anomaly_service import (
    LOGIN_BURST_THRESHOLD,
    LOGIN_BURST_WINDOW,
    check_login_failure_burst,
)

IP = "203.0.113.7"  # TEST-NET-3 documentation address


async def _failures(db_session, n: int, *, action="LOGIN_FAILED", ip=IP, minutes_ago=1):
    at = datetime.now(UTC) - timedelta(minutes=minutes_ago)
    for _ in range(n):
        db_session.add(
            AuditLog(
                id=uuid.uuid4(),
                action=action,
                entity_type="user",
                ip_address=ip,
                created_at=at,
            )
        )
    await db_session.commit()


def test_window_covers_the_hourly_scan():
    assert LOGIN_BURST_WINDOW == timedelta(hours=1)
    assert LOGIN_BURST_THRESHOLD == 20


@pytest.mark.asyncio
async def test_more_than_threshold_is_flagged(db_session):
    await _failures(db_session, LOGIN_BURST_THRESHOLD + 1)

    events = await check_login_failure_burst(db_session)

    assert len(events) == 1
    assert events[0].check_name == "login_failure_burst"
    assert IP in events[0].detail
    assert str(LOGIN_BURST_THRESHOLD + 1) in events[0].detail


@pytest.mark.asyncio
async def test_threshold_itself_is_not_flagged(db_session):
    await _failures(db_session, LOGIN_BURST_THRESHOLD)

    assert await check_login_failure_burst(db_session) == []


@pytest.mark.asyncio
async def test_wrong_otp_codes_count(db_session):
    await _failures(db_session, 11, action="LOGIN_FAILED")
    await _failures(db_session, 10, action="OTP_FAILED")

    events = await check_login_failure_burst(db_session)

    assert len(events) == 1
    assert "21" in events[0].detail


@pytest.mark.asyncio
async def test_failures_early_in_the_hour_are_seen(db_session):
    """The old 5-minute window missed everything before :25."""
    await _failures(db_session, LOGIN_BURST_THRESHOLD + 1, minutes_ago=50)

    assert len(await check_login_failure_burst(db_session)) == 1


@pytest.mark.asyncio
async def test_failures_older_than_an_hour_are_ignored(db_session):
    await _failures(db_session, LOGIN_BURST_THRESHOLD + 1, minutes_ago=61)

    assert await check_login_failure_burst(db_session) == []


@pytest.mark.asyncio
async def test_ips_are_counted_separately(db_session):
    await _failures(db_session, 15, ip="203.0.113.7")
    await _failures(db_session, 15, ip="203.0.113.8")
    await _failures(db_session, LOGIN_BURST_THRESHOLD + 1, ip=None)

    assert await check_login_failure_burst(db_session) == []


@pytest.mark.asyncio
async def test_other_actions_do_not_count(db_session):
    await _failures(db_session, LOGIN_BURST_THRESHOLD + 1, action="OTP_SENT")

    assert await check_login_failure_burst(db_session) == []
