"""
Alembic migration environment — synchronous psycopg2 connection.

asyncpg (the async driver used by the FastAPI runtime) has a known
incompatibility with Docker Desktop networking on Windows that causes
WinError 64 / ConnectionResetError during SSL negotiation even when
ssl=disable is requested.  Alembic does not need async I/O, so we use
psycopg2 (synchronous) for migrations only.  The FastAPI app continues
to use asyncpg at runtime — this file does not affect that.

DATABASE_URL is loaded from app.core.config.settings (.env) and the
asyncpg driver prefix is replaced with psycopg2 before connecting.

Run migrations from the backend/ directory:
  alembic upgrade head
  alembic revision --autogenerate -m "describe_the_change"
  alembic downgrade -1
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool
from sqlalchemy.engine import Connection

# ---------------------------------------------------------------------------
# Alembic config / logging
# ---------------------------------------------------------------------------
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------------------------------------------------------------------------
# Load DATABASE_URL and convert asyncpg → psycopg2
# ---------------------------------------------------------------------------
from app.core.config import settings  # noqa: E402

# The .env uses postgresql+asyncpg://... for the FastAPI runtime.
# Replace the driver with psycopg2 so Alembic uses a synchronous connection.
_async_url: str = settings.DATABASE_URL
_sync_url: str = _async_url.replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
).replace(
    "postgresql://", "postgresql+psycopg2://"
)
# Strip any asyncpg-specific query params that psycopg2 doesn't understand.
if "?" in _sync_url:
    _base, _qs = _sync_url.split("?", 1)
    _kept = "&".join(
        p for p in _qs.split("&")
        if not p.startswith("ssl=")
    )
    _sync_url = f"{_base}?{_kept}" if _kept else _base

config.set_main_option("sqlalchemy.url", _sync_url)

# ---------------------------------------------------------------------------
# Register all ORM models with Base.metadata
# ---------------------------------------------------------------------------
from app.db.base import Base  # noqa: E402
import app.models  # noqa: E402, F401

target_metadata = Base.metadata


# ---------------------------------------------------------------------------
# Offline migration
# ---------------------------------------------------------------------------

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online migration (synchronous — no asyncio needed)
# ---------------------------------------------------------------------------

def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(
        config.get_main_option("sqlalchemy.url"),  # type: ignore[arg-type]
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        do_run_migrations(connection)
    connectable.dispose()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
