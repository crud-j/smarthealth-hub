"""
Tests for the System Health endpoint (GET /api/v1/system/status), its
classification rules, the Celery heartbeat task, and the sanitized /health/db
error body.

Redis and the disk are faked so results do not depend on the machine running
the tests. The database check runs against the real test database.

Fixtures from conftest.py: client, admin_token, bhw_token
"""

from __future__ import annotations

import json
from collections import namedtuple
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.services import system_status_service as svc
from app.workers import monitoring_tasks

URL = "/api/v1/system/status"
ALERT_PHONE = "+639170001234"
NOW = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)

_DiskUsage = namedtuple("_DiskUsage", "total used free")


class _FakeRedis:
    def __init__(self, heartbeat: str | None = None, fail: bool = False) -> None:
        self.heartbeat = heartbeat
        self.fail = fail

    async def ping(self) -> bool:
        if self.fail:
            raise ConnectionError("Error connecting to secret-redis-host:6379")
        return True

    async def get(self, key: str) -> str | None:
        return self.heartbeat if key == monitoring_tasks.HEARTBEAT_KEY else None


def _backup_status(
    at: datetime | None, status: str = "ok", message: str = "done"
) -> dict[str, Any]:
    return {
        "status": status,
        "message": message,
        "last_attempt_at": (at or NOW).isoformat(),
        "last_success": None
        if at is None
        else {
            "at": at.isoformat(),
            "db_file": "db-x.dump",
            "db_bytes": 116355,
            "media_file": "media-x.tar.gz",
            "media_bytes": 3121238,
            "duration_seconds": 1,
        },
        "schedule": "daily 22:30 Asia/Manila",
        "keep_days": 14,
    }


@pytest.fixture
def healthy_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Media folder with one file, a fresh backup, alert phone set, disk 30% used."""
    media = tmp_path / "media"
    (media / "health_cards").mkdir(parents=True)
    (media / "health_cards" / "card.pdf").write_bytes(b"x" * 1000)

    status_file = tmp_path / "backups" / "status.json"
    status_file.parent.mkdir()
    recent = datetime.now(tz=UTC) - timedelta(hours=3)
    status_file.write_text(json.dumps(_backup_status(recent)), encoding="utf-8")

    monkeypatch.setattr(settings, "MEDIA_DIR", media)
    monkeypatch.setattr(settings, "BACKUP_STATUS_FILE", status_file)
    monkeypatch.setattr(settings, "ADMIN_ALERT_PHONE", ALERT_PHONE)
    monkeypatch.setattr(settings, "GIT_COMMIT", "abc1234")
    monkeypatch.setattr(
        svc.shutil, "disk_usage", lambda _p: _DiskUsage(100 * 2**30, 30 * 2**30, 70 * 2**30)
    )
    fresh = (datetime.now(tz=UTC) - timedelta(seconds=20)).isoformat()
    monkeypatch.setattr(svc, "get_shared_redis", lambda: _FakeRedis(heartbeat=fresh))
    return status_file


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


async def test_status_requires_login(client: AsyncClient) -> None:
    response = await client.get(URL)
    assert response.status_code == 401


async def test_status_forbidden_for_non_admin(client: AsyncClient, bhw_token: str) -> None:
    response = await client.get(URL, headers={"Authorization": f"Bearer {bhw_token}"})
    assert response.status_code == 403


async def test_status_all_ok(client: AsyncClient, admin_token: str, healthy_env: Path) -> None:
    response = await client.get(URL, headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["overall"] == "ok"
    assert body["version"]["commit"] == "abc1234"
    assert body["database"]["status"] == "ok"
    assert body["database"]["size_bytes"] > 0
    assert body["redis"]["status"] == "ok"
    assert body["workers"]["status"] == "ok"
    assert body["workers"]["age_seconds"] < 60
    assert body["disk"]["used_percent"] == 30.0
    assert body["media"] == {
        "status": "ok",
        "message": body["media"]["message"],
        "size_bytes": 1000,
        "file_count": 1,
    }
    assert body["backup"]["status"] == "ok"
    assert body["backup"]["db_bytes"] == 116355
    assert body["alerts"]["admin_alert_phone_configured"] is True
    # The phone number itself is never returned.
    assert ALERT_PHONE not in response.text


async def test_status_redis_down(
    client: AsyncClient,
    admin_token: str,
    healthy_env: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(svc, "get_shared_redis", lambda: _FakeRedis(fail=True))

    response = await client.get(URL, headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["overall"] == "error"
    assert body["redis"]["status"] == "error"
    assert body["workers"]["status"] == "unknown"
    # Other sections still report normally.
    assert body["database"]["status"] == "ok"
    # Raw exception text stays in the server log.
    assert "secret-redis-host" not in response.text


async def test_status_no_heartbeat_is_error(
    client: AsyncClient,
    admin_token: str,
    healthy_env: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(svc, "get_shared_redis", lambda: _FakeRedis(heartbeat=None))

    response = await client.get(URL, headers={"Authorization": f"Bearer {admin_token}"})

    body = response.json()
    assert body["workers"]["status"] == "error"
    assert body["overall"] == "error"


@pytest.mark.parametrize(
    ("environment", "expected"), [("development", "unknown"), ("production", "error")]
)
async def test_status_missing_backup_file(
    client: AsyncClient,
    admin_token: str,
    healthy_env: Path,
    monkeypatch: pytest.MonkeyPatch,
    environment: str,
    expected: str,
) -> None:
    healthy_env.unlink()
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)

    response = await client.get(URL, headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200, response.text
    assert response.json()["backup"]["status"] == expected


async def test_status_alert_phone_missing_is_warning(
    client: AsyncClient,
    admin_token: str,
    healthy_env: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ADMIN_ALERT_PHONE", "")

    response = await client.get(URL, headers={"Authorization": f"Bearer {admin_token}"})

    body = response.json()
    assert body["alerts"]["status"] == "warning"
    assert body["alerts"]["admin_alert_phone_configured"] is False
    assert body["overall"] == "warning"


# ---------------------------------------------------------------------------
# Classification rules
# ---------------------------------------------------------------------------


def test_heartbeat_rules() -> None:
    assert svc.classify_heartbeat(None, NOW).status == "error"
    assert svc.classify_heartbeat("not-a-date", NOW).status == "error"
    fresh = svc.classify_heartbeat((NOW - timedelta(seconds=30)).isoformat(), NOW)
    assert (fresh.status, fresh.age_seconds) == ("ok", 30)
    assert (
        svc.classify_heartbeat((NOW - timedelta(seconds=170)).isoformat(), NOW).status == "warning"
    )


@pytest.mark.parametrize(
    ("hours_ago", "expected"),
    [(3, "ok"), (25.9, "ok"), (30, "warning"), (49, "warning"), (60, "error")],
)
def test_backup_age_rules(hours_ago: float, expected: str) -> None:
    check = svc.classify_backup(_backup_status(NOW - timedelta(hours=hours_ago)), NOW)
    assert check.status == expected
    assert check.age_hours == round(hours_ago, 1)


def test_backup_failed_attempt_after_recent_success_warns() -> None:
    data = _backup_status(NOW - timedelta(hours=2), status="error", message="pg_dump failed")
    check = svc.classify_backup(data, NOW)
    assert check.status == "warning"
    assert "pg_dump failed" in check.message


def test_backup_never_succeeded_is_error() -> None:
    check = svc.classify_backup(_backup_status(None, status="error", message="disk full"), NOW)
    assert check.status == "error"
    assert "disk full" in check.message


def test_backup_unreadable_file_is_error(tmp_path: Path) -> None:
    bad = tmp_path / "status.json"
    bad.write_text("{not json", encoding="utf-8")
    assert svc.check_backup(bad, NOW).status == "error"


@pytest.mark.parametrize(("used", "expected"), [(50, "ok"), (80, "warning"), (95, "error")])
def test_disk_rules(used: int, expected: str) -> None:
    assert svc.classify_disk(100, 100 - used).status == expected


def test_overall_rules() -> None:
    assert svc.overall_status(["ok", "unknown"]) == "ok"
    assert svc.overall_status(["ok", "warning"]) == "warning"
    assert svc.overall_status(["warning", "error", "ok"]) == "error"


# ---------------------------------------------------------------------------
# Heartbeat task
# ---------------------------------------------------------------------------


def test_heartbeat_task_writes_key_with_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    import redis as redis_lib

    calls: list[tuple[str, str, int]] = []

    class _SyncRedis:
        def __enter__(self) -> _SyncRedis:
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def set(self, key: str, value: str, ex: int) -> None:
            calls.append((key, value, ex))

    monkeypatch.setattr(redis_lib, "from_url", lambda *_a, **_k: _SyncRedis())

    monitoring_tasks.heartbeat()

    assert len(calls) == 1
    key, value, ttl = calls[0]
    assert key == "system:heartbeat"
    assert ttl == monitoring_tasks.HEARTBEAT_TTL_SECONDS
    assert abs((datetime.now(tz=UTC) - datetime.fromisoformat(value)).total_seconds()) < 5


# ---------------------------------------------------------------------------
# /health/db must not leak exception text
# ---------------------------------------------------------------------------


async def test_health_db_error_is_generic(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.db.session as session_module

    class _Broken:
        async def __aenter__(self) -> None:
            raise OSError("connect failed: user=shh password=hunter2 host=db")

        async def __aexit__(self, *_: object) -> None:
            return None

    monkeypatch.setattr(session_module, "AsyncSessionLocal", lambda: _Broken())

    response = await client.get("/health/db")

    assert response.status_code == 503
    assert "Database unavailable" in response.text
    assert "hunter2" not in response.text
    assert "connect failed" not in response.text
