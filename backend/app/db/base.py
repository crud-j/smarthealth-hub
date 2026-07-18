"""
SQLAlchemy declarative base for all ORM models.

All models must inherit from ``Base``.  Alembic reads ``Base.metadata``
to detect schema changes and generate migration scripts.

The naming_convention dict ensures every constraint (index, unique, check,
foreign-key, primary-key) gets a deterministic name that Alembic can
track across renames — without this, PostgreSQL assigns anonymous names
and Alembic cannot drop/alter them reliably.
"""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# Constraint-naming convention understood by Alembic's autogenerate.
# Tokens are expanded by SQLAlchemy at DDL-emit time.
NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """
    Common base class inherited by every ORM model in SmartHealth Hub.

    Subclasses must define:
      - ``__tablename__: str``        — PostgreSQL table name
      - ``__table_args__``            — (optional) tuple of constraints/Index objects
        followed by a dict of kw-args (e.g. ``schema``, ``comment``).
    """

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
