"""
Celery Beat report tasks for SmartHealth Hub.

Tasks:
  send_weekly_report  — runs every Friday at 09:00 UTC (17:00 PHT).
    Queries aggregate counts for the last 7 days: new patient registrations,
    appointments created, and SMS reminder delivery vs. failure counts.
    Emails a plain-text summary to all active admin users via Gmail SMTP.

  send_monthly_report — runs on the last Friday of each month at 09:15 UTC
    (17:15 PHT, offset from weekly to avoid DB contention).
    Same metrics as the weekly report but covering the full calendar month,
    plus immunization completion rate for the month.

Both tasks:
  - Skip silently (INFO log) when REPORT_EMAIL_ENABLED=False.
  - Skip silently (WARNING log) when EMAIL_HOST_USER / EMAIL_HOST_PASSWORD
    are not set.
  - Skip silently (WARNING log) when no active admin users exist.
  - Never raise — all exceptions are caught and logged so Beat re-runs are
    not suppressed.
  - Query aggregate counts only — no PHI rows are fetched or emailed.
  - Use CelerySessionLocal (NullPool engine) + asyncio.run() so each task
    gets a fresh event loop (Celery worker requirement; see workers/db.py).

Registration:
  "app.workers.report_tasks" is listed in celery_app.include and the
  "send-weekly-report" / "send-monthly-report" entries are in
  celery_app.conf.beat_schedule.

No Alembic migration is needed — only aggregate COUNT queries on existing
tables.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.appointment import Appointment
from app.models.immunization import Immunization
from app.models.patient import Patient
from app.models.sms_log import SmsLog
from app.models.user import Role, User
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_PHT = timezone(timedelta(hours=8))


def _send_email(subject: str, body: str, recipients: list[str]) -> bool:
    """Send plain-text email via Gmail SMTP (SSL on port 465).

    Returns True if the message was accepted by the SMTP server, False if it
    was skipped (missing credentials / empty recipients) or if the SMTP
    server rejected it.  Never raises — all exceptions are logged.

    Args:
        subject:    Email subject line.
        body:       Plain-text email body (UTF-8).
        recipients: List of destination email addresses.

    Returns:
        True when the email was delivered to the SMTP server; False otherwise.
    """
    host_user: str = settings.EMAIL_HOST_USER
    host_password: str = settings.EMAIL_HOST_PASSWORD

    if not host_user or not host_password:
        logger.warning(
            "_send_email: EMAIL_HOST_USER or EMAIL_HOST_PASSWORD is not set "
            "— skipping report email"
        )
        return False

    if not recipients:
        logger.warning("_send_email: recipient list is empty — skipping report email")
        return False

    from_name: str = getattr(settings, "EMAIL_FROM_NAME", "SmartHealth Hub")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{host_user}>"
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as smtp:
            smtp.login(host_user, host_password)
            smtp.sendmail(host_user, recipients, msg.as_string())
        logger.info(
            "Report email '%s' sent to %d recipient(s): %s",
            subject,
            len(recipients),
            ", ".join(recipients),
        )
        return True
    except smtplib.SMTPException as exc:
        logger.error(
            "_send_email: SMTP error sending '%s': %s",
            subject,
            exc,
            exc_info=True,
        )
        return False


async def _get_admin_emails(db: AsyncSession) -> list[str]:
    """Return email addresses of all active admin users.

    Joins User to Role so that the role name string 'admin' can be used
    directly — User.role_id is a FK to roles.id and the role name lives in
    Role.name.

    Args:
        db: Active async SQLAlchemy session.

    Returns:
        List of non-empty email address strings for active admin users.
    """
    rows: list[str] = (
        await db.execute(
            sa.select(User.email)
            .join(Role, User.role_id == Role.id)
            .where(Role.name == "admin")
            .where(User.is_active == sa.true())
        )
    ).scalars().all()
    return [e for e in rows if e]


# ---------------------------------------------------------------------------
# Weekly report task
# ---------------------------------------------------------------------------


@celery_app.task(name="reports.send_weekly", bind=False)
def send_weekly_report() -> dict[str, object]:
    """Send weekly summary report to all active admin users.

    Runs every Friday at 09:00 UTC (17:00 PHT) via Celery Beat.

    Metrics included:
      - New patient registrations in the last 7 days.
      - Appointments created in the last 7 days.
      - SMS reminders delivered vs. failed in the last 7 days.

    Returns:
        Dict with keys: ``sent`` (bool), ``recipients`` (int), ``skipped``
        (str | None — reason if skipped, else None).
    """

    async def _run() -> dict[str, object]:
        from app.workers.db import CelerySessionLocal

        if not settings.REPORT_EMAIL_ENABLED:
            logger.info(
                "send_weekly_report: REPORT_EMAIL_ENABLED=False — skipping"
            )
            return {"sent": False, "recipients": 0, "skipped": "REPORT_EMAIL_ENABLED=False"}

        async with CelerySessionLocal() as db:
            recipients = await _get_admin_emails(db)

            if not recipients:
                logger.warning(
                    "send_weekly_report: no active admin users found — skipping"
                )
                return {"sent": False, "recipients": 0, "skipped": "no_admin_users"}

            # Date range: last 7 days expressed in UTC (DB stores in UTC).
            now_pht = datetime.now(_PHT)
            week_start_pht = now_pht - timedelta(days=7)
            week_start_utc = week_start_pht.astimezone(timezone.utc).replace(tzinfo=None)

            # New patient registrations created in the period.
            total_patients: int = (
                await db.execute(
                    sa.select(sa.func.count())
                    .select_from(Patient)
                    .where(Patient.created_at >= week_start_utc)
                )
            ).scalar_one()

            # Appointments created in the period.
            total_appointments: int = (
                await db.execute(
                    sa.select(sa.func.count())
                    .select_from(Appointment)
                    .where(Appointment.created_at >= week_start_utc)
                )
            ).scalar_one()

            # SMS reminders with status='delivered' in the period.
            sms_sent: int = (
                await db.execute(
                    sa.select(sa.func.count())
                    .select_from(SmsLog)
                    .where(SmsLog.created_at >= week_start_utc)
                    .where(SmsLog.status == "delivered")
                )
            ).scalar_one()

            # SMS reminders with status='failed' in the period.
            sms_failed: int = (
                await db.execute(
                    sa.select(sa.func.count())
                    .select_from(SmsLog)
                    .where(SmsLog.created_at >= week_start_utc)
                    .where(SmsLog.status == "failed")
                )
            ).scalar_one()

        period = (
            f"{week_start_pht.strftime('%b %d')} – {now_pht.strftime('%b %d, %Y')}"
        )
        subject = f"SmartHealth Hub — Weekly Report ({period})"

        sms_status_line = (
            f"WARNING: {sms_failed} SMS reminder(s) failed. Check Celery logs."
            if sms_failed > 0
            else "All SMS reminders delivered successfully."
        )

        body = (
            f"SmartHealth Hub — Weekly Summary Report\n"
            f"{period}\n"
            f"{'=' * 48}\n"
            f"\n"
            f"PATIENT REGISTRATIONS\n"
            f"  New patients this week : {total_patients}\n"
            f"\n"
            f"APPOINTMENTS\n"
            f"  Scheduled this week    : {total_appointments}\n"
            f"\n"
            f"SMS REMINDERS\n"
            f"  Delivered              : {sms_sent}\n"
            f"  Failed                 : {sms_failed}\n"
            f"\n"
            f"{sms_status_line}\n"
            f"\n"
            f"{'=' * 48}\n"
            f"This report is generated automatically every Friday at 17:00 PHT.\n"
            f"SmartHealth Hub — Barangay Health Center HCIMS\n"
        )

        sent = _send_email(subject=subject, body=body, recipients=recipients)
        return {"sent": sent, "recipients": len(recipients), "skipped": None}

    try:
        return asyncio.run(_run())
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "send_weekly_report: unexpected error: %s",
            exc,
            exc_info=True,
        )
        return {"sent": False, "recipients": 0, "skipped": f"error: {exc}"}


# ---------------------------------------------------------------------------
# Monthly report task
# ---------------------------------------------------------------------------


@celery_app.task(name="reports.send_monthly", bind=False)
def send_monthly_report() -> dict[str, object]:
    """Send monthly summary report to all active admin users.

    Approximates "last Friday of the month" via Celery Beat schedule
    (day_of_month=22-31 AND day_of_week=friday, 09:15 UTC = 17:15 PHT).

    Metrics included:
      - New patient registrations in the current calendar month.
      - Appointments created in the current calendar month.
      - SMS reminders delivered vs. failed in the current calendar month.
      - Immunization completion rate for immunizations with next_due_date in
        the current calendar month.

    Returns:
        Dict with keys: ``sent`` (bool), ``recipients`` (int), ``skipped``
        (str | None — reason if skipped, else None).
    """

    async def _run() -> dict[str, object]:
        from app.workers.db import CelerySessionLocal

        if not settings.REPORT_EMAIL_ENABLED:
            logger.info(
                "send_monthly_report: REPORT_EMAIL_ENABLED=False — skipping"
            )
            return {"sent": False, "recipients": 0, "skipped": "REPORT_EMAIL_ENABLED=False"}

        async with CelerySessionLocal() as db:
            recipients = await _get_admin_emails(db)

            if not recipients:
                logger.warning(
                    "send_monthly_report: no active admin users found — skipping"
                )
                return {"sent": False, "recipients": 0, "skipped": "no_admin_users"}

            # Month range: first day of the current month in PHT → now, expressed in UTC.
            now_pht = datetime.now(_PHT)
            month_start_pht = now_pht.replace(
                day=1, hour=0, minute=0, second=0, microsecond=0
            )
            month_start_utc = month_start_pht.astimezone(timezone.utc).replace(
                tzinfo=None
            )

            # New patient registrations this month.
            total_patients: int = (
                await db.execute(
                    sa.select(sa.func.count())
                    .select_from(Patient)
                    .where(Patient.created_at >= month_start_utc)
                )
            ).scalar_one()

            # Appointments created this month.
            total_appointments: int = (
                await db.execute(
                    sa.select(sa.func.count())
                    .select_from(Appointment)
                    .where(Appointment.created_at >= month_start_utc)
                )
            ).scalar_one()

            # SMS reminders with status='delivered' this month.
            sms_sent: int = (
                await db.execute(
                    sa.select(sa.func.count())
                    .select_from(SmsLog)
                    .where(SmsLog.created_at >= month_start_utc)
                    .where(SmsLog.status == "delivered")
                )
            ).scalar_one()

            # SMS reminders with status='failed' this month.
            sms_failed: int = (
                await db.execute(
                    sa.select(sa.func.count())
                    .select_from(SmsLog)
                    .where(SmsLog.created_at >= month_start_utc)
                    .where(SmsLog.status == "failed")
                )
            ).scalar_one()

            # Immunizations due this month: next_due_date falls within the month.
            # next_due_date is a Date column; compare using month_start_utc.date().
            month_start_date = month_start_pht.date()

            total_due: int = (
                await db.execute(
                    sa.select(sa.func.count())
                    .select_from(Immunization)
                    .where(Immunization.next_due_date >= month_start_date)
                    .where(Immunization.next_due_date <= now_pht.date())
                )
            ).scalar_one()

            total_completed: int = (
                await db.execute(
                    sa.select(sa.func.count())
                    .select_from(Immunization)
                    .where(Immunization.next_due_date >= month_start_date)
                    .where(Immunization.next_due_date <= now_pht.date())
                    .where(Immunization.status == "completed")
                )
            ).scalar_one()

        # Guard against division-by-zero when no immunizations are due.
        immunization_rate: float = (
            round(total_completed / total_due * 100, 1) if total_due > 0 else 0.0
        )
        sms_total = sms_sent + sms_failed
        sms_success_rate: float = (
            round(sms_sent / sms_total * 100, 1) if sms_total > 0 else 0.0
        )

        month_name = month_start_pht.strftime("%B %Y")
        subject = f"SmartHealth Hub — Monthly Report ({month_name})"

        body = (
            f"SmartHealth Hub — Monthly Summary Report\n"
            f"{month_name}\n"
            f"{'=' * 48}\n"
            f"\n"
            f"PATIENT REGISTRATIONS\n"
            f"  New patients this month : {total_patients}\n"
            f"\n"
            f"APPOINTMENTS\n"
            f"  Scheduled this month    : {total_appointments}\n"
            f"\n"
            f"SMS REMINDERS\n"
            f"  Delivered               : {sms_sent}\n"
            f"  Failed                  : {sms_failed}\n"
            f"  Success rate            : {sms_success_rate}%\n"
            f"\n"
            f"IMMUNIZATIONS\n"
            f"  Due this month          : {total_due}\n"
            f"  Completed               : {total_completed}\n"
            f"  Completion rate         : {immunization_rate}%\n"
            f"\n"
            f"{'=' * 48}\n"
            f"This report is generated automatically on the last Friday of each month at 17:15 PHT.\n"
            f"SmartHealth Hub — Barangay Health Center HCIMS\n"
        )

        sent = _send_email(subject=subject, body=body, recipients=recipients)
        return {"sent": sent, "recipients": len(recipients), "skipped": None}

    try:
        return asyncio.run(_run())
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "send_monthly_report: unexpected error: %s",
            exc,
            exc_info=True,
        )
        return {"sent": False, "recipients": 0, "skipped": f"error: {exc}"}
