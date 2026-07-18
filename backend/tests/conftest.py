"""
Pytest configuration and shared async fixtures for SmartHealth Hub API tests.

Design principles:
  - All DB-touching fixtures use a test-dedicated PostgreSQL database
    (smarthealthhub_test) so they never touch development/production data.
  - Tables are created once per test session (session-scoped ``db_tables``).
  - Each test function runs inside a SAVEPOINT that is rolled back after the
    test, keeping tests isolated without the overhead of drop/recreate per test.
  - HTTP-layer tests use an ``httpx.AsyncClient`` with ``ASGITransport`` pointed
    at the real FastAPI ``app`` instance, with ``get_db`` overridden to use the
    same test session so DB assertions inside tests see what the endpoint wrote.
  - Convenience fixtures (``make_role``, ``make_user``, ``admin_token``,
    ``bhw_token``) cover the most common test setup patterns.

Async mode is configured in pyproject.toml: ``asyncio_mode = "auto"`` —
every coroutine test function runs automatically without ``@pytest.mark.asyncio``.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import AsyncGenerator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import Role, User


# ---------------------------------------------------------------------------
# Derive the test database URL from the configured DATABASE_URL.
# Replace the database name component with ``smarthealthhub_test``.
# e.g. postgresql+asyncpg://user:pass@host:port/smarthealthhub
#   → postgresql+asyncpg://user:pass@host:port/smarthealthhub_test
# ---------------------------------------------------------------------------


def _test_database_url(base_url: str) -> str:
    """
    Swap the database name in ``base_url`` to use the test database.

    Handles both ``postgresql+asyncpg://...`` and plain ``postgresql://...``
    DSN forms.  The database name is the last path segment of the URL.
    """
    # Use a simple regex to replace the final path segment (database name).
    return re.sub(r"(/[^/]*)$", "/smarthealthhub_test", base_url)


_TEST_DATABASE_URL = _test_database_url(settings.DATABASE_URL)


# ---------------------------------------------------------------------------
# Session-scoped engine — created once and shared across all tests.
# NullPool prevents the engine from pooling connections, which is important
# for correctness when tests manipulate transaction boundaries manually.
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="session")
async def engine():
    """
    Create a test-database async engine for the entire test session.

    Uses NullPool so every ``connect()`` call gets a fresh connection — this
    avoids the async-pool interaction issues that arise when the same pooled
    connection is reused across coroutine boundaries in tests.
    """
    test_engine = create_async_engine(
        _TEST_DATABASE_URL,
        echo=False,
        poolclass=NullPool,
    )
    yield test_engine
    await test_engine.dispose()


# ---------------------------------------------------------------------------
# Session-scoped table setup / teardown
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="session", autouse=True)
async def db_tables(engine):
    """
    Create all ORM tables at the start of the test session and drop them
    at the end.

    ``autouse=True`` means this runs automatically for every test session
    without needing to be requested explicitly.

    Note: this imports all models via ``app.models`` so SQLAlchemy's mapper
    is aware of every table before ``create_all`` is called.
    """
    # Importing models ensures they are registered on Base.metadata.
    import app.models  # noqa: F401 — registers all ORM models

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# ---------------------------------------------------------------------------
# Function-scoped DB session with SAVEPOINT-based rollback
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    """
    Yield an ``AsyncSession`` that wraps each test in a nested transaction
    (SAVEPOINT).  After the test, the savepoint is rolled back so the next
    test starts with a clean slate — without recreating tables.

    The outer transaction is also rolled back so no data ever touches the
    physical DB rows.

    Pattern:
        BEGIN
          SAVEPOINT test_sp
          < test runs — inserts, updates, etc. >
          ROLLBACK TO SAVEPOINT test_sp
        ROLLBACK
    """
    async with engine.connect() as conn:
        # Begin the outer transaction.
        await conn.begin()

        # Open a SAVEPOINT inside the outer transaction.
        await conn.begin_nested()

        # Bind an AsyncSession to this connection so the session and the
        # test share the same DB transaction.
        session = AsyncSession(bind=conn, expire_on_commit=False)

        # After the session commits (which releases the savepoint), re-open
        # a new savepoint so subsequent operations within the same test are
        # still rolled back.
        @event.listens_for(session.sync_session, "after_transaction_end")
        def _restart_savepoint(session_: Any, transaction: Any) -> None:  # noqa: ANN401
            if transaction.nested and not transaction._parent.nested:
                # Synchronously restart the savepoint.
                session_.begin_nested()

        try:
            yield session
        finally:
            await session.close()
            # Roll back the outer transaction — discards everything.
            await conn.rollback()


# ---------------------------------------------------------------------------
# Function-scoped HTTP test client
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Yield an ``httpx.AsyncClient`` wired to the FastAPI app under test.

    The ``get_db`` dependency is overridden to yield the same ``db_session``
    used by the test, so HTTP-layer assertions can see exactly what the
    endpoint wrote to the DB — and everything is rolled back after the test.
    """

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Role and User factory fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def make_role(db_session: AsyncSession):
    """
    Factory fixture: create a ``Role`` row in the test DB if it does not
    already exist for the given name.

    Returns the ``Role`` ORM object.

    Usage::

        async def test_something(make_role):
            admin_role = await make_role("admin")
    """
    created_roles: dict[str, Role] = {}

    async def _make(name: str, permissions: dict[str, Any] | None = None) -> Role:
        if name in created_roles:
            return created_roles[name]

        role = Role(
            id=uuid.uuid4(),
            name=name,
            permissions=permissions or {},
        )
        db_session.add(role)
        await db_session.commit()
        await db_session.refresh(role)
        created_roles[name] = role
        return role

    return _make


@pytest_asyncio.fixture
async def make_user(db_session: AsyncSession, make_role):
    """
    Factory fixture: create a ``User`` row in the test DB with the specified
    role, email, and password.

    MFA is disabled by default (``mfa_enabled=False``) so tests do not need
    to complete an OTP flow unless they are explicitly testing MFA.

    Usage::

        async def test_something(make_user):
            bhw = await make_user("bhw")
            admin = await make_user("admin", email="admin@test.local")
    """

    async def _make(
        role_name: str = "bhw",
        email: str | None = None,
        password: str = "testpass123!",
    ) -> User:
        role = await make_role(role_name)

        # Derive a deterministic but unique email from the role name if not provided.
        resolved_email = email or f"test_{role_name}_{uuid.uuid4().hex[:6]}@test.local"

        # Mobile must be unique — use a pseudo-random suffix.
        mobile_suffix = abs(hash(resolved_email)) % 100000
        mobile = f"+6391700{mobile_suffix:05d}"

        user = User(
            id=uuid.uuid4(),
            full_name=f"Test {role_name.title()} User",
            email=resolved_email,
            mobile_number=mobile,
            password_hash=hash_password(password),
            role_id=role.id,
            is_active=True,
            mfa_enabled=False,  # disabled for test convenience
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        return user

    return _make


# ---------------------------------------------------------------------------
# Convenience token fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def admin_token(make_user) -> str:
    """
    Create an Admin user and return a valid JWT access token string.

    Use in test request headers::

        response = await client.get("/api/v1/users", headers={"Authorization": f"Bearer {admin_token}"})
    """
    user: User = await make_user("admin")
    # The role relationship is loaded on the User object after make_user commits.
    return create_access_token(subject=str(user.id), role="admin")


@pytest_asyncio.fixture
async def bhw_token(make_user) -> str:
    """
    Create a BHW user and return a valid JWT access token string.

    Usage is identical to ``admin_token``.
    """
    user: User = await make_user("bhw")
    return create_access_token(subject=str(user.id), role="bhw")
