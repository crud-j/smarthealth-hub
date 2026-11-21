"""
Audit log anomaly detection service for SmartHealth Hub.

Checks performed (all query the last N minutes/hours of audit_logs):

  check_phi_view_burst        — same user viewed >50 patient records
                                (VIEW_PHI action) in the last 60 minutes.
  check_after_hours_deletes   — DELETE actions on patient entity_type outside
                                08:00–18:00 Philippine Standard Time (UTC+8)
                                in the last 24 hours.
  check_login_failure_burst   — same IP had >20 failed sign-ins (wrong
                                password or wrong OTP code) in the last hour
                                (brute-force indicator).

All checks are read-only — they never write to the database.
Called from app.workers.audit_tasks (Celery Beat, hourly).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta, timezone

import sqlalchemy as sa
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

# Philippine Standard Time = UTC+8
_PHT_OFFSET = timedelta(hours=8)
_PHT = timezone(_PHT_OFFSET)

# The scan runs once an hour, so it looks at the whole hour (a shorter window
# would miss failures between scans). The login rate limit holds one person
# on one account to 5 wrong passwords per 15 minutes (20 an hour); more than
# that from one IP means several accounts or password + OTP guessing.
LOGIN_BURST_WINDOW = timedelta(hours=1)
LOGIN_BURST_THRESHOLD = 20
_SIGNIN_FAILURE_ACTIONS = ("LOGIN_FAILED", "OTP_FAILED")

PHI_VIEW_BURST_THRESHOLD = 50
# Record views are written as "VIEW_PHI".  The card full-verify wrote
# "PHI_VIEW" until 2026-11; those stored rows still count.
_PHI_VIEW_ACTIONS = ("VIEW_PHI", "PHI_VIEW")


class AnomalyEvent(BaseModel):
    """Describes a single detected audit anomaly."""

    check_name: str
    detail: str
    severity: str  # "HIGH" | "MEDIUM" | "LOW"


async def check_phi_view_burst(db: AsyncSession) -> list[AnomalyEvent]:
    """
    Detect: same user performed >50 VIEW_PHI audit actions in the last 60 minutes.

    A burst of record views indicates a potentially compromised account performing
    mass record exfiltration.  Threshold of 50 accommodates legitimate
    clinic-hours batch work while flagging overnight sweeps.

    Args:
        db: Active async database session (read-only access sufficient).

    Returns:
        List of AnomalyEvent — one per offending user_id.  Empty list when
        no violations are found.
    """
    cutoff = datetime.now(UTC) - timedelta(minutes=60)

    rows = (
        await db.execute(
            sa.select(
                AuditLog.user_id,
                sa.func.count().label("cnt"),
            )
            .where(
                AuditLog.action.in_(_PHI_VIEW_ACTIONS),
                AuditLog.created_at >= cutoff,
                AuditLog.user_id.isnot(None),
            )
            .group_by(AuditLog.user_id)
            .having(sa.func.count() > PHI_VIEW_BURST_THRESHOLD)
        )
    ).all()

    return [
        AnomalyEvent(
            check_name="phi_view_burst",
            detail=f"User {row.user_id} viewed {row.cnt} patient records in the last 60 minutes",
            severity="HIGH",
        )
        for row in rows
    ]


async def check_after_hours_deletes(db: AsyncSession) -> list[AnomalyEvent]:
    """
    Detect: DELETE actions on 'patient' entity_type outside 08:00–18:00 PHT
    in the last 24 hours.

    Patient record deletions (soft-deletes / deactivations) performed outside
    business hours are suspicious and should be reviewed by the Admin.

    PHT conversion: audit_logs stores UTC; add 8 hours before extracting the
    hour component.

    Args:
        db: Active async database session (read-only access sufficient).

    Returns:
        List of AnomalyEvent — one per offending audit row.  Empty list when
        no violations are found.
    """
    cutoff = datetime.now(UTC) - timedelta(hours=24)

    rows = (
        (
            await db.execute(
                sa.select(AuditLog).where(
                    AuditLog.action == "DELETE",
                    AuditLog.entity_type == "patient",
                    AuditLog.created_at >= cutoff,
                    sa.or_(
                        sa.extract(
                            "hour",
                            AuditLog.created_at
                            + sa.cast(
                                sa.text("interval '8 hours'"),
                                sa.Interval,
                            ),
                        )
                        < 8,
                        sa.extract(
                            "hour",
                            AuditLog.created_at
                            + sa.cast(
                                sa.text("interval '8 hours'"),
                                sa.Interval,
                            ),
                        )
                        >= 18,
                    ),
                )
            )
        )
        .scalars()
        .all()
    )

    return [
        AnomalyEvent(
            check_name="after_hours_delete",
            detail=(
                f"DELETE on patient record (entity_id={row.entity_id}) "
                f"by user {row.user_id} at "
                f"{(row.created_at.replace(tzinfo=UTC) + _PHT_OFFSET).strftime('%Y-%m-%d %H:%M')} PHT"
            ),
            severity="HIGH",
        )
        for row in rows
    ]


async def check_login_failure_burst(db: AsyncSession) -> list[AnomalyEvent]:
    """
    Detect: same IP address had more than LOGIN_BURST_THRESHOLD failed
    sign-ins (LOGIN_FAILED + OTP_FAILED) in the last LOGIN_BURST_WINDOW
    (brute-force / credential-stuffing / OTP-guessing indicator).

    Only IPs where ip_address IS NOT NULL are considered — NULL means the
    request came through a proxy that stripped the header.

    Args:
        db: Active async database session (read-only access sufficient).

    Returns:
        List of AnomalyEvent — one per offending IP address.  Empty list when
        no violations are found.
    """
    cutoff = datetime.now(UTC) - LOGIN_BURST_WINDOW

    rows = (
        await db.execute(
            sa.select(
                AuditLog.ip_address.label("ip"),
                sa.func.count().label("cnt"),
            )
            .where(
                AuditLog.action.in_(_SIGNIN_FAILURE_ACTIONS),
                AuditLog.created_at >= cutoff,
                AuditLog.ip_address.isnot(None),
            )
            .group_by(AuditLog.ip_address)
            .having(sa.func.count() > LOGIN_BURST_THRESHOLD)
        )
    ).all()

    return [
        AnomalyEvent(
            check_name="login_failure_burst",
            detail=f"IP {row.ip} had {row.cnt} failed sign-ins in the last hour",
            severity="HIGH",
        )
        for row in rows
    ]
