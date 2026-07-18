"""
AuditLog ORM model — append-only.

Table: audit_logs (SDP Section 4)

SECURITY NOTE: This table MUST be append-only.
  - The API service role must NOT have UPDATE or DELETE privileges on this
    table.  Enforce via PostgreSQL GRANT/REVOKE in the migration.
  - Row-Level Security (RLS) is recommended as defence-in-depth.
  - The service layer must NEVER expose an update/delete method for audit logs.

``action`` standard values (extend as needed):
  CREATE, UPDATE, DELETE, VIEW_PHI, LOGIN, LOGOUT, LOGIN_FAILED,
  CARD_ISSUE, CARD_VERIFY, CARD_REVOKE, OTP_SENT, OTP_VERIFIED

``entity_type`` examples: "patient", "user", "health_card", "medical_history",
  "visit", "appointment", "immunization"

``metadata`` JSONB stores contextual diff or search parameters — e.g.
  {"fields_changed": ["address", "mobile_number"]} for an UPDATE, or
  {"card_method": "nfc"} for a CARD_VERIFY action.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class AuditLog(Base):
    """
    Immutable audit trail entry.

    One row per user action that touches a sensitive entity.  Bulk reads
    (e.g. list patients) do NOT produce audit rows; individual PHI reads
    (e.g. view medical history) DO.

    ``ip_address`` stores the client IP (IPv4 or IPv6 up to 45 chars,
    supports IPv4-mapped IPv6 addresses such as ::ffff:192.0.2.1).
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        sa.Index("idx_audit_user", "user_id"),
        sa.Index("idx_audit_entity", "entity_type", "entity_id"),
        sa.Index("idx_audit_created", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "users.id",
            name="fk_audit_logs_user_id_users",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    action: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    entity_type: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True
    )
    metadata_: Mapped[dict] = mapped_column(
        "metadata",  # DB column name stays "metadata"
        JSONB,
        nullable=False,
        server_default=sa.text("'{}'::jsonb"),
    )
    ip_address: Mapped[str | None] = mapped_column(sa.String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    # Relationships
    user: Mapped["User | None"] = relationship(
        "User",
        back_populates="audit_logs",
        lazy="noload",
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog action={self.action!r} "
            f"entity_type={self.entity_type!r} entity_id={self.entity_id}>"
        )
