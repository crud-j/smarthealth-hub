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

_active_test_session: AsyncSession | None = None


def set_test_session(session: AsyncSession | None) -> None:
    """Bind the active in-process test session to Celery worker helpers.

    This is used by the pytest savepoint fixture to let a direct task helper
    read rows created in the same test transaction without opening a second
    database connection (which would not see the savepoint-scoped rows).
    """
    global _active_test_session
    _active_test_session = session


class CelerySessionLocal:
    """Create a fresh async session bound to the current DATABASE_URL for each task."""

    def __init__(self) -> None:
        self._engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            poolclass=NullPool,
        )
        self._session_factory = async_sessionmaker(
            bind=self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
        self._session: AsyncSession | None = None

    async def __aenter__(self) -> AsyncSession:
        global _active_test_session
        if _active_test_session is not None:
            self._session = _active_test_session
            return self._session

        self._session = self._session_factory()
        await self._session.__aenter__()
        return self._session

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._session is not None and self._session is not _active_test_session:
            await self._session.__aexit__(exc_type, exc_val, exc_tb)
            await self._engine.dispose()
