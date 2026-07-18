"""
CardVerification ORM model.

Table: card_verifications (SDP Section 4)

Records every successful or failed card scan event (NFC tap or QR scan)
for audit and analytics purposes.  The analytics dashboard uses these rows
to report card utilization metrics.

``verification_method`` distinguishes physical NFC taps from QR code scans
— both methods call the same backend verify endpoint but the method is
logged here for traceability.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.health_card import HealthCard
    from app.models.user import User


class CardVerification(Base):
    """
    Append-only record of a card verification attempt.

    Every NFC tap and QR scan produces one row here.  Both success=True
    and success=False outcomes are recorded to support brute-force /
    tampered-card detection.
    """

    __tablename__ = "card_verifications"
    __table_args__ = (
        sa.CheckConstraint(
            "verification_method IN ('nfc', 'qr')",
            name="card_verifications_method_check",
        ),
        sa.Index("idx_cardverif_card", "health_card_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    health_card_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "health_cards.id",
            name="fk_card_verifications_health_card_id_health_cards",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    verification_method: Mapped[str] = mapped_column(sa.String(10), nullable=False)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "users.id",
            name="fk_card_verifications_verified_by_users",
        ),
        nullable=True,
    )
    verified_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )
    success: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("TRUE")
    )

    # Relationships
    health_card: Mapped["HealthCard"] = relationship(
        "HealthCard",
        back_populates="verifications",
        lazy="noload",
    )
    verified_by_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[verified_by],
        lazy="noload",
    )

    def __repr__(self) -> str:
        return (
            f"<CardVerification card_id={self.health_card_id} "
            f"method={self.verification_method!r} success={self.success}>"
        )
