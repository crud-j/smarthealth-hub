"""
Alembic migration environment.

DATABASE_URL is loaded from app.core.config.settings so the same
environment variable (.env file) controls both the running API and migrations.

To generate a new migration after adding/changing models:
  alembic revision --autogenerate -m "describe_the_change"

To apply migrations:
  alembic upgrade head
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Load alembic.ini logging config
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Load DATABASE_URL from application settings ───────────────────────────────
from app.core.config import settings  # noqa: E402

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# ── Target metadata ───────────────────────────────────────────────────────────
# Wire in Base.metadata once models exist (Phase 1+):
#   from app.db.base import Base
#   from app.models import *  # noqa: F401, F403 — ensures all models are imported
#   target_metadata = Base.metadata
target_metadata = None  # Phase 0 scaffold — no models yet


# ── Offline migration (generates SQL script without DB connection) ─────────────
def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online migration (connects to DB and applies changes) ─────────────────────
def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
