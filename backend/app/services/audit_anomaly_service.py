"""
Audit log anomaly detection service for SmartHealth Hub.

Checks performed (all query the last N minutes/hours of audit_logs):

  check_phi_view_burst        — same user viewed >50 patient records
                                (PHI_VIEW action) in the last 60 minutes.
  check_after_hours_deletes   — DELETE actions on patient entity_type outside
                                08:00–18:00 Philippine Standard Time (UTC+8)
                                in the last 24 hours.
  check_login_failure_burst   — same IP had >10 LOGIN_FAILED events in the
                                last 5 minutes (brute-force indicator).

All checks are read-only — they never write to the database.
Called from app.workers.audit_tasks (Celery Beat, hourly).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

# Philippine Standard Time = UTC+8
_PHT_OFFSET = timedelta(hours=8)
_PHT = timezone(_PHT_OFFSET)


class AnomalyEvent(BaseModel):
    """Describes a single detected audit anomaly."""

    check_name: str
    detail: str
    severity: str  # "HIGH" | "MEDIUM" | "LOW"


async def check_phi_view_burst(db: AsyncSession) -> list[AnomalyEvent]:
    """
    Detect: same user performed >50 PHI_VIEW audit actions in the last 60 minutes.

    A PHI_VIEW burst indicates a potentially compromised account performing
    mass record exfiltration.  Threshold of 50 accommodates legitimate
    clinic-hours batch work while flagging overnight sweeps.

    Args:
        db: Active async database session (read-only access sufficient).

    Returns:
        List of AnomalyEvent — one per offending user_id.  Empty list when
        no violations are found.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=60)

    rows = (
        await db.execute(
            sa.select(
                AuditLog.user_id,
                sa.func.count().label("cnt"),
            )
            .where(
                AuditLog.action == "PHI_VIEW",
                AuditLog.created_at >= cutoff,
                AuditLog.user_id.isnot(None),
            )
            .group_by(AuditLog.user_id)
            .having(sa.func.count() > 50)
        )
    ).all()

    return [
        AnomalyEvent(
            check_name="phi_view_burst",
            detail=(
                f"User {row.user_id} performed {row.cnt} PHI_VIEW actions "
                f"in the last 60 minutes"
            ),
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
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    rows = (
        await db.execute(
            sa.select(AuditLog)
            .where(
                AuditLog.action == "DELETE",
                AuditLog.entity_type == "patient",
                AuditLog.created_at >= cutoff,
                sa.or_(
                    sa.extract(
                        "hour",
                        AuditLog.created_at + sa.cast(
                            sa.text("interval '8 hours'"),
                            sa.Interval,
                        ),
                    )
                    < 8,
                    sa.extract(
                        "hour",
                        AuditLog.created_at + sa.cast(
                            sa.text("interval '8 hours'"),
                            sa.Interval,
                        ),
                    )
                    >= 18,
                ),
            )
        )
    ).scalars().all()

    return [
        AnomalyEvent(
            check_name="after_hours_delete",
            detail=(
                f"DELETE on patient record (entity_id={row.entity_id}) "
                f"by user {row.user_id} at "
                f"{(row.created_at.replace(tzinfo=timezone.utc) + _PHT_OFFSET).strftime('%Y-%m-%d %H:%M')} PHT"
            ),
            severity="HIGH",
        )
        for row in rows
    ]


async def check_login_failure_burst(db: AsyncSession) -> list[AnomalyEvent]:
    """
    Detect: same IP address had >10 LOGIN_FAILED audit events in the last
    5 minutes (brute-force / credential-stuffing indicator).

    Only IPs where ip_address IS NOT NULL are considered — NULL means the
    request came through a proxy that stripped the header.

    Args:
        db: Active async database session (read-only access sufficient).

    Returns:
        List of AnomalyEvent — one per offending IP address.  Empty list when
        no violations are found.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)

    rows = (
        await db.execute(
            sa.select(
                AuditLog.ip_address.label("ip"),
                sa.func.count().label("cnt"),
            )
            .where(
                AuditLog.action == "LOGIN_FAILED",
                AuditLog.created_at >= cutoff,
                AuditLog.ip_address.isnot(None),
            )
            .group_by(AuditLog.ip_address)
            .having(sa.func.count() > 10)
        )
    ).all()

    return [
        AnomalyEvent(
            check_name="login_failure_burst",
            detail=(
                f"IP {row.ip} had {row.cnt} failed login attempts "
                f"in the last 5 minutes"
            ),
            severity="HIGH",
        )
        for row in rows
    ]
