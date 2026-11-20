"""
SystemSetting ORM model — admin-editable runtime settings.

One row per overridden setting (SDP §5.8 "System settings: SMS templates,
reminder lead times"). A missing row means the default is used: ``.env`` for
the clinic name and reminder lead times, the built-in templates in
``app.services.sms_templates`` for SMS text. The allowed keys and their
validation live in ``app.services.system_settings_service``.

``value`` is JSONB so integers stay integers. No PHI is ever stored here.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SystemSetting(Base):
    """A single admin override of a runtime setting."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(sa.String(100), primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        server_default=sa.func.now(),
        nullable=False,
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "users.id",
            name="fk_system_settings_updated_by_users",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<SystemSetting key={self.key!r}>"
