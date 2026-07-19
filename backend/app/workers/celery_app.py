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

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "smarthealthhub",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.sms_tasks",
        "app.workers.reminder_scheduler",
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
# Celery Beat schedule — periodic reminders
# ---------------------------------------------------------------------------
celery_app.conf.beat_schedule = {
    # Run at the top of every hour — finds appointments due for a reminder.
    "dispatch-appointment-reminders-hourly": {
        "task": "reminders.dispatch_appointment_reminders",
        "schedule": crontab(minute=0),
    },
    # Run once per day at 8 AM (Asia/Manila) — finds immunizations due.
    "dispatch-immunization-reminders-daily": {
        "task": "reminders.dispatch_immunization_reminders",
        "schedule": crontab(hour=8, minute=0),
    },
}
