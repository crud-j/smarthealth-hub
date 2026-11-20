"""
Reliability metrics on the System Health page (SDP §11.7: SMS delivery
failure rate and OTP failure rate, ISO 25010 Reliability).

Three parts of ``GET /api/v1/system/status`` → ``reliability``:
  - sms       counts from ``sms_logs`` (24 h and 7 days)
  - sign_in   counts from ``audit_logs`` (LOGIN*, LOGIN_FAILED, OTP_*)
  - reminders last run of the reminder jobs (Redis, written by the jobs)

Counts only; no phone numbers, message text or names are returned.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.sms_log import SmsLog
from app.schemas.system_config import SignInWindow, SmsWindow
from app.services import system_status_service as svc
from app.workers import monitoring_tasks, reminder_scheduler

URL = "/api/v1/system/status"
NOW = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)


def _sms(sent: int = 0, failed: int = 0, stuck: int = 0) -> SmsWindow:
    finished = sent + failed
    pct = round(failed / finished * 100, 1) if finished else None
    return SmsWindow(sent=sent, failed=failed, stuck=stuck, failure_percent=pct)


def _signin(
    successful: int = 0, failed_password: int = 0, failed_otp: int = 0, otp_sent: int = 0
) -> SignInWindow:
    return SignInWindow(
        successful=successful,
        failed_password=failed_password,
        failed_otp=failed_otp,
        otp_sent=otp_sent,
        otp_verified=0,
        otp_success_percent=None,
    )


# ---------------------------------------------------------------------------
# SMS rules
# ---------------------------------------------------------------------------


def test_sms_no_traffic_in_a_week_is_unknown() -> None:
    assert svc.classify_sms(_sms(), _sms()).status == "unknown"


def test_sms_quiet_day_after_busy_week_is_ok() -> None:
    assert svc.classify_sms(_sms(), _sms(sent=40)).status == "ok"


@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (_sms(sent=100, failed=4), "ok"),  # 3.8 %, under 5 failures
        (_sms(sent=100, failed=5), "warning"),  # 5 failures (existing hourly alert level)
        (_sms(sent=18, failed=2), "warning"),  # 10 %
        (_sms(sent=1, failed=1), "warning"),  # 50 % but too few to call it broken
        (_sms(sent=3, failed=1), "error"),  # 25 % of 4
        (_sms(sent=0, failed=6), "error"),  # everything fails
        (_sms(sent=50, stuck=1), "warning"),  # waiting for over an hour
    ],
)
def test_sms_rules(day: SmsWindow, expected: str) -> None:
    week = _sms(sent=day.sent + 10, failed=day.failed, stuck=day.stuck)
    assert svc.classify_sms(day, week).status == expected


def test_sms_error_message_mentions_gateway() -> None:
    check = svc.classify_sms(_sms(sent=0, failed=6), _sms(sent=0, failed=6))
    assert "100.0%" in check.message
    assert "gateway" in check.message


# ---------------------------------------------------------------------------
# Sign-in rules
# ---------------------------------------------------------------------------


def test_signin_no_activity_is_unknown() -> None:
    assert svc.classify_sign_in(_signin(), _signin()).status == "unknown"


@pytest.mark.parametrize(
    ("failed_password", "failed_otp", "expected"),
    [(0, 0, "ok"), (10, 9, "ok"), (15, 5, "warning"), (30, 19, "warning"), (40, 10, "error")],
)
def test_signin_rules(failed_password: int, failed_otp: int, expected: str) -> None:
    day = _signin(successful=3, failed_password=failed_password, failed_otp=failed_otp)
    assert svc.classify_sign_in(day, day).status == expected


# ---------------------------------------------------------------------------
# Counting (real test database)
# ---------------------------------------------------------------------------


def _sms_row(status: str, created_at: datetime) -> SmsLog:
    return SmsLog(
        mobile_number="+639170000000",
        message="test",
        status=status,
        created_at=created_at,
    )


async def test_count_sms_windows(db_session: AsyncSession) -> None:
    now = datetime.now(tz=UTC)
    rows = [
        _sms_row("sent", now - timedelta(minutes=5)),
        _sms_row("delivered", now - timedelta(hours=3)),
        _sms_row("replied", now - timedelta(hours=4)),
        _sms_row("failed", now - timedelta(hours=1)),
        _sms_row("queued", now - timedelta(minutes=10)),  # still normal
        _sms_row("queued", now - timedelta(hours=2)),  # stuck
        _sms_row("sent", now - timedelta(days=2)),  # week only
        _sms_row("failed", now - timedelta(days=3)),  # week only
        _sms_row("queued", now - timedelta(days=3)),  # stuck, week only
        _sms_row("sent", now - timedelta(days=9)),  # outside both windows
    ]
    db_session.add_all(rows)
    await db_session.flush()

    day = await svc.count_sms(db_session, since=now - timedelta(hours=24), now=now)
    week = await svc.count_sms(db_session, since=now - timedelta(days=7), now=now)

    assert day == SmsWindow(sent=3, failed=1, stuck=1, failure_percent=25.0)
    assert week == SmsWindow(sent=4, failed=2, stuck=2, failure_percent=33.3)


def _audit_row(action: str, created_at: datetime) -> AuditLog:
    return AuditLog(
        user_id=uuid.uuid4(),
        action=action,
        entity_type="user",
        metadata_={},
        created_at=created_at,
    )


async def test_count_sign_ins(db_session: AsyncSession) -> None:
    now = datetime.now(tz=UTC)
    recent = now - timedelta(hours=1)
    rows = [
        _audit_row("LOGIN", recent),
        _audit_row("LOGIN", recent),
        _audit_row("PASSKEY_LOGIN", recent),
        _audit_row("LOGIN_TRUSTED_DEVICE", recent),
        _audit_row("LOGIN_FAILED", recent),
        _audit_row("OTP_FAILED", recent),
        _audit_row("OTP_FAILED", recent),
        _audit_row("OTP_SENT", recent),
        _audit_row("OTP_SENT", recent),
        _audit_row("OTP_SENT", recent),
        _audit_row("UPDATE", recent),  # not a sign-in
        _audit_row("LOGIN_FAILED", now - timedelta(days=8)),  # too old
    ]
    db_session.add_all(rows)
    await db_session.flush()

    day = await svc.count_sign_ins(db_session, since=now - timedelta(hours=24))

    assert day == SignInWindow(
        successful=4,
        failed_password=1,
        failed_otp=2,
        otp_sent=3,
        otp_verified=2,
        otp_success_percent=66.7,
    )


async def test_otp_success_is_capped_at_100(db_session: AsyncSession) -> None:
    """OTP_SENT rows older than the window can make verified > sent."""
    now = datetime.now(tz=UTC)
    db_session.add_all([_audit_row("LOGIN", now), _audit_row("LOGIN", now)])
    db_session.add(_audit_row("OTP_SENT", now))
    await db_session.flush()

    day = await svc.count_sign_ins(db_session, since=now - timedelta(hours=24))

    assert day.otp_success_percent == 100.0


# ---------------------------------------------------------------------------
# Reminder runs (Redis)
# ---------------------------------------------------------------------------


class _SyncRedis:
    def __init__(self, calls: list[tuple[str, str, int]]) -> None:
        self.calls = calls

    def __enter__(self) -> _SyncRedis:
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def set(self, key: str, value: str, ex: int) -> None:
        self.calls.append((key, value, ex))


def test_record_reminder_run_writes_json_with_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    import redis as redis_lib

    calls: list[tuple[str, str, int]] = []
    monkeypatch.setattr(redis_lib, "from_url", lambda *_a, **_k: _SyncRedis(calls))

    monitoring_tasks.record_reminder_run("appointment", 3)

    [(key, value, ttl)] = calls
    assert key == "reminders:last_run:appointment"
    assert ttl == monitoring_tasks.REMINDER_RUN_TTL_SECONDS
    data = json.loads(value)
    assert data["queued"] == 3
    assert abs((datetime.now(tz=UTC) - datetime.fromisoformat(data["at"])).total_seconds()) < 5


def test_record_reminder_run_never_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    import redis as redis_lib

    def _broken(*_a: Any, **_k: Any) -> None:
        raise ConnectionError("redis down")

    monkeypatch.setattr(redis_lib, "from_url", _broken)
    monitoring_tasks.record_reminder_run("immunization", 1)  # must not raise


@pytest.mark.parametrize(
    ("task_name", "async_name", "job"),
    [
        (
            "dispatch_appointment_reminders",
            "_dispatch_appointment_reminders_async",
            "appointment",
        ),
        (
            "dispatch_immunization_reminders",
            "_dispatch_immunization_reminders_async",
            "immunization",
        ),
    ],
)
def test_reminder_jobs_record_their_run(
    monkeypatch: pytest.MonkeyPatch, task_name: str, async_name: str, job: str
) -> None:
    recorded: list[tuple[str, int]] = []

    async def _fake_dispatch() -> int:
        return 7

    monkeypatch.setattr(reminder_scheduler, async_name, _fake_dispatch)
    monkeypatch.setattr(
        reminder_scheduler, "record_reminder_run", lambda j, n: recorded.append((j, n))
    )

    result = getattr(reminder_scheduler, task_name)()

    assert result == {"queued_count": 7}
    assert recorded == [(job, 7)]


class _FakeAsyncRedis:
    def __init__(self, values: dict[str, str]) -> None:
        self.values = values

    async def get(self, key: str) -> str | None:
        return self.values.get(key)


async def test_check_reminder_runs(monkeypatch: pytest.MonkeyPatch) -> None:
    at = "2026-11-20T02:00:00+00:00"
    monkeypatch.setattr(
        svc,
        "get_shared_redis",
        lambda: _FakeAsyncRedis(
            {
                "reminders:last_run:appointment": json.dumps({"at": at, "queued": 2}),
                "reminders:last_run:immunization": "not json",
            }
        ),
    )

    check = await svc.check_reminder_runs()

    assert check.status == "ok"
    by_job = {run.job: run for run in check.runs}
    assert by_job["appointment"].last_run_at == datetime.fromisoformat(at)
    assert by_job["appointment"].queued == 2
    assert by_job["immunization"].last_run_at is None


async def test_check_reminder_runs_none_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(svc, "get_shared_redis", lambda: _FakeAsyncRedis({}))
    check = await svc.check_reminder_runs()
    assert check.status == "unknown"
    assert [run.job for run in check.runs] == ["appointment", "immunization"]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


async def test_status_includes_reliability(
    client: AsyncClient,
    admin_token: str,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime.now(tz=UTC)
    db_session.add_all(
        [_sms_row("failed", now - timedelta(minutes=30)) for _ in range(6)]
        + [_audit_row("LOGIN_FAILED", now - timedelta(minutes=5))]
    )
    await db_session.flush()
    monkeypatch.setattr(svc, "get_shared_redis", lambda: _FakeAsyncRedis({}))

    response = await client.get(URL, headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200, response.text
    body = response.json()
    rel = body["reliability"]
    assert rel["sms"]["status"] == "error"
    assert rel["sms"]["last_24h"]["failed"] == 6
    assert rel["sign_in"]["last_24h"]["failed_password"] == 1
    assert rel["reminders"]["status"] == "unknown"
    # A failing SMS gateway turns the whole page red.
    assert body["overall"] == "error"
    # Counts only: no phone numbers or message text.
    assert "+63917" not in response.text
