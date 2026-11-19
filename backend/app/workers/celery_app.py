"""
Celery application factory for SmartHealth Hub background tasks.

Broker:  Redis (REDIS_URL from settings)
Backend: Redis (task result storage)

Tasks registered via ``include``:
  - app.workers.sms_tasks          — send_reminder_task
  - app.workers.reminder_scheduler — dispatch_appointment_reminders,
                                     dispatch_immunization_reminders

Run worker locally (from the backend/ directory):
  celery -A app.workers.celery_app worker --loglevel=info -P solo

  Use -P solo on Windows (no fork support).  On Linux/macOS use the default
  prefork pool or -P gevent for async tasks.

Run beat scheduler (periodic tasks):
  celery -A app.workers.celery_app beat --loglevel=info

Run both worker and beat in one process (dev convenience only — NOT for prod):
  celery -A app.workers.celery_app worker --beat --loglevel=info -P solo
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

# Asia/Manila timezone used to pin crontab evaluation for schedules that must
# fire at a fixed local wall-clock time regardless of the worker's system TZ.
_MANILA_TZ = ZoneInfo("Asia/Manila")


def manila_now() -> datetime:
    """Return the current time in Asia/Manila.

    Used as the ``nowfun`` for crontab schedules that must fire at an exact
    Philippine local time. Defined at module level (not a lambda) so that
    Celery Beat's PersistentScheduler can pickle the beat_schedule into its
    shelve file — lambdas are not picklable and crash beat at startup.
    """
    return datetime.now(tz=_MANILA_TZ)


celery_app = Celery(
    "smarthealthhub",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.sms_tasks",
        "app.workers.reminder_scheduler",
        "app.workers.ai_tasks",
        "app.workers.registration_tasks",
        "app.workers.monitoring_tasks",
        "app.workers.health_card_tasks",
        "app.workers.card_tasks",
        "app.workers.audit_tasks",
        "app.workers.report_tasks",
    ],
)

celery_app.config_from_object(
    {
        "task_serializer": "json",
        "result_serializer": "json",
        "accept_content": ["json"],
        "timezone": "Asia/Manila",
        "enable_utc": True,
        # Track task start time (visible in Flower / result backend).
        "task_track_started": True,
        # Acknowledge task only after it is complete, so a worker crash
        # causes the task to be re-queued rather than silently dropped.
        "task_acks_late": True,
        # Prefetch only 1 task per worker slot — important for tasks that
        # call external APIs (SMS) so Redis backpressure works correctly.
        "worker_prefetch_multiplier": 1,
        # Re-queue task if the worker is lost mid-execution.
        "task_reject_on_worker_lost": True,
    }
)

# ---------------------------------------------------------------------------
# Celery Beat schedule
#
# All times are Asia/Manila (``timezone`` above). The production VM is switched
# OFF at 23:00 by Azure auto-shutdown and started by hand in the morning, and
# Celery Beat never re-runs a job whose time passed while it was down. So every
# daily job must fire between ~10:00 and 22:59, or it silently never runs.
# (The backup at 22:30 is a separate container with its own catch-up.)
# ---------------------------------------------------------------------------
celery_app.conf.beat_schedule = {
    # Every minute — liveness signal for the System Health page. `expires`
    # drops heartbeats that sat in the queue (worker down), so a worker coming
    # back does not replay a backlog of stale ones.
    "system-heartbeat": {
        "task": "monitoring.heartbeat",
        "schedule": crontab(),
        "options": {"expires": 50},
    },
    # Run at the top of every hour — finds appointments due for a reminder.
    # Task registered in reminder_scheduler.py with @celery_app.task(name=...).
    "dispatch-appointment-reminders": {
        "task": "reminders.dispatch_appointment_reminders",
        "schedule": crontab(minute=0),
    },
    # Daily 10:00 — immunization reminders. The task only picks doses due in
    # exactly SMS_IMMUNIZATION_LEAD_DAYS, so a skipped day means those patients
    # never get a reminder: keep this at a time the VM is surely running.
    "dispatch-immunization-reminders": {
        "task": "reminders.dispatch_immunization_reminders",
        "schedule": crontab(hour=10, minute=0),
    },
    # Daily 21:00 — scores upcoming appointments for no-show risk. Runs after
    # mark-missed-appointments (18:00) so today's no-shows are in the data.
    "run-ai-risk-scoring": {
        "task": "ai_tasks.run_risk_scoring",
        "schedule": crontab(hour=21, minute=0),
    },
    # Daily 21:30 — detects illness trend anomalies.
    "run-ai-anomaly-detection": {
        "task": "ai_tasks.run_anomaly_detection",
        "schedule": crontab(hour=21, minute=30),
    },
    # Hourly at :30 — check SMS task failure rate and alert admin if threshold hit.
    "check-sms-failure-rate": {
        "task": "monitoring.check_sms_failure_rate",
        "schedule": crontab(minute=30),
    },
    # Hourly at :30 — scan audit_logs for suspicious access patterns and alert admin.
    # Offset matches check-sms-failure-rate intentionally: both run at :30 but are
    # independent tasks; Celery Beat enqueues them concurrently with no conflict.
    "audit-scan-anomalies": {
        "task": "audit.scan_anomalies",
        "schedule": crontab(minute=30),
    },
    # Weekly report: every Friday at 17:00 Manila (end of the work week; the
    # email text says 17:00 PHT). Emails aggregate counts (patients,
    # appointments, SMS stats) to all active admin users. Controlled by
    # REPORT_EMAIL_ENABLED in .env.
    "send-weekly-report": {
        "task": "reports.send_weekly",
        "schedule": crontab(hour=17, minute=0, day_of_week="friday"),
    },
    # Monthly report: last Friday of the month at 17:15 Manila.
    # "Last Friday" is approximated by day_of_month=22-31 AND day_of_week=friday
    # (any month's last Friday always falls on day 22–31 because no month has
    # more than 31 days).  The 15-minute offset avoids DB contention with the
    # weekly report which fires at 17:00 on the same Friday.
    "send-monthly-report": {
        "task": "reports.send_monthly",
        "schedule": crontab(hour=17, minute=15, day_of_week="friday", day_of_month="22-31"),
    },
    # Daily 18:00 Manila (after clinic hours) — mark past-due appointments as
    # 'missed' and text those patients. Not later: the follow-up SMS should not
    # arrive at night. Not more often: the SMS step has no "already sent" check.
    # nowfun pins the crontab evaluation to Asia/Manila regardless of the
    # Celery worker's system timezone.
    "mark-missed-appointments-daily": {
        "task": "workers.mark_missed_appointments",
        "schedule": crontab(
            hour=18,
            minute=0,
            nowfun=manila_now,
        ),
    },
}
celery_app.conf.timezone = "Asia/Manila"
