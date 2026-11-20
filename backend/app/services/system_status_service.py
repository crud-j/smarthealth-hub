"""
System Health checks for ``GET /api/v1/system/status`` (Admin only).

Answers "is everything working?" in one call: database, Redis, Celery
worker + beat, disk, media folder, last backup, alert phone, deployed commit,
and reliability metrics (SDP §11.7): SMS delivery and sign-in/OTP failures
over the last 24 h / 7 days, and the last run of each reminder job.

Design rules:
  - Every check is independent. A broken dependency (e.g. Redis down) is
    reported as ``status="error"`` in its own section and never makes the
    endpoint itself fail.
  - Raw exception text is logged server-side, never returned (it can contain
    hostnames, usernames or file paths).
  - No PHI is read. The backup check opens only ``status.json`` (written by
    infra/backup/backup.sh), never the dump files. The alert phone number is
    reported as configured yes/no, never the number itself. Reliability
    metrics are counts only (no phone numbers, message text or user names).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import get_shared_redis
from app.models.audit_log import AuditLog
from app.models.sms_log import SmsLog
from app.schemas.system_config import (
    AlertsCheck,
    BackupCheck,
    CheckStatus,
    DatabaseCheck,
    DiskCheck,
    MediaCheck,
    RedisCheck,
    ReliabilityChecks,
    ReminderRun,
    ReminderRuns,
    SignInReliability,
    SignInWindow,
    SmsReliability,
    SmsWindow,
    SystemStatusResponse,
    VersionInfo,
    WorkerCheck,
)
from app.workers.monitoring_tasks import (
    HEARTBEAT_KEY,
    HEARTBEAT_TTL_SECONDS,
    REMINDER_JOBS,
    REMINDER_RUN_KEY_PREFIX,
)

logger = logging.getLogger(__name__)

# Heartbeat is written every 60 s. Older than this = beat/worker running late.
HEARTBEAT_WARN_SECONDS = 150

# Disk: Postgres stops accepting writes when the disk fills up.
DISK_WARN_PERCENT = 80.0
DISK_ERROR_PERCENT = 90.0

# Backups run daily at 22:30. 26 h = one run missed by a little; 50 h = two
# runs missed. (After a weekend with the VM off, the catch-up backup runs a
# couple of minutes after start-up and the status turns green again.)
BACKUP_WARN_HOURS = 26.0
BACKUP_ERROR_HOURS = 50.0

# SMS (last 24 h). 5 failures = the level of the existing hourly admin alert
# (monitoring_tasks.check_sms_failure_rate). Red needs a few messages so one
# failed SMS out of one does not look like an outage.
SMS_WARN_FAILED = 5
SMS_WARN_PERCENT = 10.0
SMS_ERROR_PERCENT = 25.0
SMS_ERROR_MIN_FINISHED = 4
# A reminder is queued and normally sent within seconds; still queued after
# this long means the worker or the SMS gateway is stuck.
SMS_STUCK_MINUTES = 60

# Sign-in failures (wrong password + wrong OTP) in the last 24 h. A small
# health center has a handful of staff; this many failures means someone is
# probably guessing passwords.
SIGNIN_WARN_FAILURES = 20
SIGNIN_ERROR_FAILURES = 50

_SMS_SENT_STATUSES = ("sent", "delivered", "replied")
_SIGNIN_SUCCESS_ACTIONS = ("LOGIN", "LOGIN_TRUSTED_DEVICE", "PASSKEY_LOGIN")
_SIGNIN_ACTIONS = (*_SIGNIN_SUCCESS_ACTIONS, "LOGIN_FAILED", "OTP_FAILED", "OTP_SENT")

_MAX_MESSAGE_CHARS = 300
_SEVERITY: dict[CheckStatus, int] = {"unknown": 0, "ok": 0, "warning": 1, "error": 2}


# ---------------------------------------------------------------------------
# Pure classification helpers (unit-tested directly)
# ---------------------------------------------------------------------------


def classify_heartbeat(raw: str | None, now: datetime) -> WorkerCheck:
    """Turn the ``system:heartbeat`` Redis value into a WorkerCheck."""
    if raw is None:
        minutes = HEARTBEAT_TTL_SECONDS // 60
        return WorkerCheck(
            status="error",
            message=(
                f"No signal from the background jobs for over {minutes} minutes: "
                "reminders, SMS and card PDFs are not being processed. "
                "If the server just started, wait a minute and refresh."
            ),
        )
    try:
        at = datetime.fromisoformat(raw)
    except ValueError:
        return WorkerCheck(status="error", message="Heartbeat value is unreadable.")
    age = max(0, int((now - at).total_seconds()))
    if age > HEARTBEAT_WARN_SECONDS:
        return WorkerCheck(
            status="warning",
            message="The background jobs are running late.",
            last_heartbeat_at=at,
            age_seconds=age,
        )
    return WorkerCheck(
        status="ok",
        message="Worker and scheduler are running.",
        last_heartbeat_at=at,
        age_seconds=age,
    )


def classify_disk(total: int, free: int) -> DiskCheck:
    used_percent = round((total - free) / total * 100, 1) if total else 0.0
    status: CheckStatus = "ok"
    message = "Enough free space."
    if used_percent >= DISK_ERROR_PERCENT:
        status = "error"
        message = "Disk almost full. The database stops working when the disk is full."
    elif used_percent >= DISK_WARN_PERCENT:
        status = "warning"
        message = "Disk is filling up. Free space soon (e.g. docker builder prune -f)."
    return DiskCheck(
        status=status,
        message=message,
        total_bytes=total,
        free_bytes=free,
        used_percent=used_percent,
    )


def _parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _as_int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def classify_backup(data: dict[str, Any], now: datetime) -> BackupCheck:
    """Turn the parsed ``status.json`` of the backup service into a BackupCheck."""
    last = data.get("last_success") if isinstance(data.get("last_success"), dict) else None
    last_at = _parse_time(last.get("at")) if last else None
    file_message = str(data.get("message") or "")[:_MAX_MESSAGE_CHARS]
    common: dict[str, Any] = {
        "last_attempt_at": _parse_time(data.get("last_attempt_at")),
        "schedule": data.get("schedule") if isinstance(data.get("schedule"), str) else None,
        "keep_days": _as_int(data.get("keep_days")),
    }

    if last is None or last_at is None:
        message = "No successful backup yet."
        if data.get("status") == "error" and file_message:
            message = f"No successful backup yet. Last attempt failed: {file_message}"
        return BackupCheck(status="error", message=message, **common)

    age_hours = round((now - last_at).total_seconds() / 3600, 1)
    status: CheckStatus = "ok"
    message = "Backups are up to date."
    if age_hours > BACKUP_ERROR_HOURS:
        status = "error"
        message = "The last good backup is more than 2 days old."
    elif age_hours > BACKUP_WARN_HOURS:
        status = "warning"
        message = "Last night's backup is missing."

    if data.get("status") == "error":
        # A failed attempt after a recent good backup: the service retries
        # every 30 minutes, so warn; the age rules escalate it if it persists.
        if status == "ok":
            status = "warning"
        message = f"Last attempt failed: {file_message or 'see dc logs backup'}"

    return BackupCheck(
        status=status,
        message=message,
        last_success_at=last_at,
        age_hours=age_hours,
        db_bytes=_as_int(last.get("db_bytes")),
        media_bytes=_as_int(last.get("media_bytes")),
        **common,
    )


def _percent(part: int, whole: int) -> float | None:
    return round(min(part / whole, 1.0) * 100, 1) if whole else None


def classify_sms(day: SmsWindow, week: SmsWindow) -> SmsReliability:
    """Rules for the SMS card (thresholds at the top of this module)."""
    finished = day.sent + day.failed
    pct = day.failure_percent or 0.0
    status: CheckStatus = "ok"
    message = "SMS are going out normally."
    if week.sent + week.failed + week.stuck == 0:
        status, message = "unknown", "No SMS in the last 7 days."
    elif finished >= SMS_ERROR_MIN_FINISHED and pct >= SMS_ERROR_PERCENT:
        status = "error"
        message = (
            f"{pct}% of SMS failed in the last 24 hours. Check the SMS gateway "
            "(phone on, load, signal) and the SMS Logs page."
        )
    elif day.failed >= SMS_WARN_FAILED or (day.failed and pct >= SMS_WARN_PERCENT):
        status = "warning"
        message = f"{day.failed} SMS failed in the last 24 hours ({pct}%). Check the SMS Logs."
    elif day.stuck:
        status = "warning"
        message = (
            f"{day.stuck} SMS still waiting after more than an hour: the background "
            "jobs or the SMS gateway may be stuck."
        )
    elif finished == 0:
        message = "No SMS in the last 24 hours."
    return SmsReliability(status=status, message=message, last_24h=day, last_7d=week)


def classify_sign_in(day: SignInWindow, week: SignInWindow) -> SignInReliability:
    """Rules for the Sign-in card (thresholds at the top of this module)."""
    failures = day.failed_password + day.failed_otp
    activity = week.successful + week.failed_password + week.failed_otp + week.otp_sent
    status: CheckStatus = "ok"
    message = "Sign-ins are working normally."
    if activity == 0:
        status, message = "unknown", "No sign-ins in the last 7 days."
    elif failures >= SIGNIN_WARN_FAILURES:
        status = "error" if failures >= SIGNIN_ERROR_FAILURES else "warning"
        message = (
            f"{failures} failed sign-ins in the last 24 hours. Someone may be guessing "
            "passwords: check the Audit Log (LOGIN_FAILED, OTP_FAILED)."
        )
    return SignInReliability(status=status, message=message, last_24h=day, last_7d=week)


def overall_status(checks: list[CheckStatus]) -> CheckStatus:
    worst = max((_SEVERITY[c] for c in checks), default=0)
    return "error" if worst == 2 else "warning" if worst == 1 else "ok"


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------


async def check_database(db: AsyncSession) -> DatabaseCheck:
    try:
        result = await db.execute(text("SELECT pg_database_size(current_database())"))
        size = int(result.scalar_one())
    except Exception:
        logger.exception("system status: database check failed")
        return DatabaseCheck(status="error", message="Cannot reach the database.")
    return DatabaseCheck(status="ok", message="Connected.", size_bytes=size)


async def check_redis_and_workers(now: datetime) -> tuple[RedisCheck, WorkerCheck]:
    try:
        r = get_shared_redis()
        await r.ping()
        # The shared pool uses decode_responses=True -> str, but newer
        # redis-py types get() as bytes | str | None.
        raw = cast("str | None", await r.get(HEARTBEAT_KEY))
    except Exception:
        logger.exception("system status: Redis check failed")
        return (
            RedisCheck(
                status="error",
                message="Cannot reach Redis. Logins, OTP codes and background jobs need it.",
            ),
            WorkerCheck(status="unknown", message="Cannot check while Redis is down."),
        )
    return RedisCheck(status="ok", message="Connected."), classify_heartbeat(raw, now)


async def count_sms(db: AsyncSession, *, since: datetime, now: datetime) -> SmsWindow:
    """Count SMS created since ``since`` by outcome (no message content is read)."""
    stuck_before = now - timedelta(minutes=SMS_STUCK_MINUTES)
    result = await db.execute(
        select(
            func.count().filter(SmsLog.status.in_(_SMS_SENT_STATUSES)),
            func.count().filter(SmsLog.status == "failed"),
            func.count().filter(and_(SmsLog.status == "queued", SmsLog.created_at < stuck_before)),
        ).where(SmsLog.created_at >= since)
    )
    sent, failed, stuck = result.one()
    return SmsWindow(
        sent=sent,
        failed=failed,
        stuck=stuck,
        failure_percent=_percent(failed, sent + failed),
    )


async def count_sign_ins(db: AsyncSession, *, since: datetime) -> SignInWindow:
    """Count sign-in audit events since ``since``."""
    result = await db.execute(
        select(AuditLog.action, func.count())
        .where(AuditLog.created_at >= since, AuditLog.action.in_(_SIGNIN_ACTIONS))
        .group_by(AuditLog.action)
    )
    counts: dict[str, int] = {action: n for action, n in result.all()}
    # LOGIN is written only after a correct OTP (passkey and trusted-device
    # sign-ins have their own actions), so it counts verified OTPs.
    verified = counts.get("LOGIN", 0)
    sent = counts.get("OTP_SENT", 0)
    return SignInWindow(
        successful=sum(counts.get(a, 0) for a in _SIGNIN_SUCCESS_ACTIONS),
        failed_password=counts.get("LOGIN_FAILED", 0),
        failed_otp=counts.get("OTP_FAILED", 0),
        otp_sent=sent,
        otp_verified=verified,
        otp_success_percent=_percent(verified, sent),
    )


async def check_sms(db: AsyncSession, now: datetime) -> SmsReliability:
    try:
        day = await count_sms(db, since=now - timedelta(hours=24), now=now)
        week = await count_sms(db, since=now - timedelta(days=7), now=now)
    except Exception:
        logger.exception("system status: SMS metrics failed")
        empty = SmsWindow(sent=0, failed=0, stuck=0)
        return SmsReliability(
            status="error", message="Cannot read the SMS log.", last_24h=empty, last_7d=empty
        )
    return classify_sms(day, week)


async def check_sign_in(db: AsyncSession, now: datetime) -> SignInReliability:
    try:
        day = await count_sign_ins(db, since=now - timedelta(hours=24))
        week = await count_sign_ins(db, since=now - timedelta(days=7))
    except Exception:
        logger.exception("system status: sign-in metrics failed")
        empty = SignInWindow(
            successful=0, failed_password=0, failed_otp=0, otp_sent=0, otp_verified=0
        )
        return SignInReliability(
            status="error", message="Cannot read the audit log.", last_24h=empty, last_7d=empty
        )
    return classify_sign_in(day, week)


def _parse_reminder_run(job: str, raw: str | None) -> ReminderRun:
    try:
        data = json.loads(raw) if raw else None
    except ValueError:
        data = None
    if not isinstance(data, dict):
        return ReminderRun(job=job)  # type: ignore[arg-type]
    return ReminderRun(
        job=job,  # type: ignore[arg-type]
        last_run_at=_parse_time(data.get("at")),
        queued=_as_int(data.get("queued")),
    )


async def check_reminder_runs() -> ReminderRuns:
    """Last run of each reminder job (information only, never yellow/red).

    A stopped scheduler already turns the Background jobs card red, and the VM
    is off at night, so "last run long ago" would warn every morning.
    """
    try:
        r = get_shared_redis()
        raws = [
            cast("str | None", await r.get(REMINDER_RUN_KEY_PREFIX + job)) for job in REMINDER_JOBS
        ]
    except Exception:
        logger.exception("system status: cannot read reminder runs")
        raws = [None] * len(REMINDER_JOBS)
    runs = [_parse_reminder_run(job, raw) for job, raw in zip(REMINDER_JOBS, raws, strict=True)]
    if any(run.last_run_at for run in runs):
        return ReminderRuns(status="ok", message="Last runs of the automatic reminders.", runs=runs)
    return ReminderRuns(
        status="unknown",
        message="No reminder run recorded yet. Appointment reminders run every hour.",
        runs=runs,
    )


def check_disk(path: Path) -> DiskCheck:
    try:
        usage = shutil.disk_usage(path)
    except OSError:
        logger.exception("system status: disk check failed")
        return DiskCheck(status="error", message="Cannot read disk usage.")
    return classify_disk(usage.total, usage.free)


def check_media(path: Path) -> MediaCheck:
    if not path.is_dir():
        return MediaCheck(status="error", message="Media folder not found.")
    size = 0
    count = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                size += os.path.getsize(os.path.join(root, name))
                count += 1
            except OSError:
                continue  # file deleted while walking
    return MediaCheck(
        status="ok",
        message="Patient photos and health-card PDFs.",
        size_bytes=size,
        file_count=count,
    )


def check_backup(path: Path, now: datetime) -> BackupCheck:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        if settings.ENVIRONMENT == "production":
            return BackupCheck(
                status="error",
                message="No backup status found. Check the backup service (dc logs backup).",
            )
        return BackupCheck(status="unknown", message="Backups run only on the server.")
    except (OSError, ValueError):
        logger.exception("system status: cannot read backup status file")
        return BackupCheck(status="error", message="Cannot read the backup status file.")
    if not isinstance(data, dict):
        return BackupCheck(status="error", message="Backup status file is malformed.")
    return classify_backup(data, now)


def check_alerts() -> AlertsCheck:
    if settings.ADMIN_ALERT_PHONE.strip():
        return AlertsCheck(
            status="ok",
            message="SMS failure alerts go to the admin phone.",
            admin_alert_phone_configured=True,
        )
    return AlertsCheck(
        status="warning",
        message="Not set: SMS failure alerts go nowhere. Set ADMIN_ALERT_PHONE in .env.server.",
        admin_alert_phone_configured=False,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def collect_system_status(db: AsyncSession) -> SystemStatusResponse:
    now = datetime.now(tz=UTC)
    media_dir = Path(settings.MEDIA_DIR)

    # File-system checks block, so run them in threads alongside the async ones.
    (redis_check, worker_check), disk, media, backup = await asyncio.gather(
        check_redis_and_workers(now),
        asyncio.to_thread(check_disk, media_dir),
        asyncio.to_thread(check_media, media_dir),
        asyncio.to_thread(check_backup, Path(settings.BACKUP_STATUS_FILE), now),
    )
    database = await check_database(db)
    alerts = check_alerts()
    # One session: these queries run one after another, never in gather().
    sms = await check_sms(db, now)
    sign_in = await check_sign_in(db, now)
    reminders = await check_reminder_runs()

    return SystemStatusResponse(
        overall=overall_status(
            [
                database.status,
                redis_check.status,
                worker_check.status,
                disk.status,
                media.status,
                backup.status,
                alerts.status,
                sms.status,
                sign_in.status,
                # reminders: information only, never part of the overall status
            ]
        ),
        checked_at=now,
        version=VersionInfo(commit=settings.GIT_COMMIT, environment=settings.ENVIRONMENT),
        database=database,
        redis=redis_check,
        workers=worker_check,
        disk=disk,
        media=media,
        backup=backup,
        alerts=alerts,
        reliability=ReliabilityChecks(sms=sms, sign_in=sign_in, reminders=reminders),
    )
