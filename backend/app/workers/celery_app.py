"""
Celery application factory for SmartHealth Hub background tasks.

Broker: Redis (REDIS_URL from settings)
Backend: Redis (for task result storage)

Tasks registered:
  - app.workers.sms_tasks.send_sms_reminder
  - app.workers.reminder_scheduler.schedule_appointment_reminders

Run worker locally:
  celery -A app.workers.celery_app worker --loglevel=info

Run beat scheduler (for periodic tasks):
  celery -A app.workers.celery_app beat --loglevel=info

Full implementation: Phase 4 (Appointments & SMS).
"""

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "smarthealth_hub",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.sms_tasks",
        "app.workers.reminder_scheduler",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Manila",
    enable_utc=True,
    # Retry policy defaults — individual tasks may override these
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

# TODO (Phase 4): Add celery_app.conf.beat_schedule for periodic reminders.
