"""
SQLAlchemy 2.0 async session factory and FastAPI dependency.

Usage in FastAPI endpoints via dependency injection::

    from app.db.session import get_db
    from sqlalchemy.ext.asyncio import AsyncSession

    async def my_endpoint(db: AsyncSession = Depends(get_db)):
        result = await db.execute(select(SomeModel))
        ...

The ``engine`` and ``AsyncSessionLocal`` are also exported for use in
Alembic env.py (online migrations) and the seed script.
"""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------
# pool_size / max_overflow are tuned for a single-BHC deployment.
# echo=False in production; set DATABASE_ECHO=true in .env for SQL debugging.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # reconnect on stale connections (important for long-idle workers)
)

# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------
# expire_on_commit=False is required with async SQLAlchemy so that
# ORM attributes remain accessible after ``await session.commit()``.
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yield an ``AsyncSession`` per request and guarantee it is closed
    (and any pending transaction rolled back) when the request finishes,
    whether it succeeded or raised an exception.

    Example::

        @router.get("/patients")
        async def list_patients(db: DbDep):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# Convenience type alias for use in endpoint signatures.
# Import it like: ``from app.db.session import DbDep``
DbDep = Annotated[AsyncSession, Depends(get_db)]
