"""
Celery-specific async DB engine and session factory.

Celery tasks wrap their async body in ``asyncio.run(...)`` (see
``_run_async`` in sms_tasks.py and the task wrappers in
reminder_scheduler.py). Each call creates a new event loop and destroys it
when the task returns. ``app.db.session.engine`` is a process-wide pooled
engine shared across the whole worker's lifetime — reusing a pooled
asyncpg connection across two different ``asyncio.run()`` calls fails,
because the connection's transport is bound to the event loop it was
created on. Once that loop closes, SQLAlchemy's ``pool_pre_ping`` check
tries to write through a dead proactor and raises
``AttributeError: 'NoneType' object has no attribute 'send'`` (or
``RuntimeError: Event loop is closed``) on the *next* task.

Fix: give Celery tasks their own engine using ``NullPool`` — no connection
is ever kept alive between checkouts, so nothing can outlive the loop it
was created on. This is SQLAlchemy's documented recommendation for async
engines used under a "fresh event loop per call" execution model (Celery,
AWS Lambda, etc.) rather than a long-lived server loop like FastAPI's.

FastAPI's app.db.session.engine is unaffected and keeps its normal pool —
it only ever runs on one long-lived event loop, so cross-loop reuse never
happens there.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

celery_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    poolclass=NullPool,
)

CelerySessionLocal = async_sessionmaker(
    bind=celery_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)
