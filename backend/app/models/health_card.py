"""
HealthCard ORM model.

Table: health_cards (SDP Section 4)

SECURITY INVARIANT — strictly enforced throughout the codebase:
  The QR payload and the NFC chip encode ONLY:
    - patient_id  (UUID)
    - card_version (int)
    - HMAC-SHA256 signature (computed with settings.QR_HMAC_SECRET)

  No PHI (name, birth_date, diagnoses, etc.) is ever placed in the card
  payload.  The card is a *pointer* — the system looks up patient data
  server-side after verifying the HMAC signature.

  Any code that attempts to put PHI into the QR payload or NFC write
  buffer is a security bug and must be rejected in code review.

``qr_payload_hash`` stores the HMAC-SHA256 hex digest of the canonical
QR payload string.  This allows the verify endpoint to detect tampering
without re-computing the secret every time.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.card_verification import CardVerification
    from app.models.patient import Patient
    from app.models.user import User


class HealthCard(Base):
    """
    Health card rows for patients.

    A patient may have multiple rows across their card history (one per
    generation: v1, v2, …).  Only one row has status='active' at a time —
    enforced by the service layer (generate_card idempotency check), not by
    a column-level unique constraint.  The composite unique index on
    (patient_id, card_version) prevents duplicate version numbers for the
    same patient.

    When a card is lost or needs reissue, the old row's status is set to
    'reissued' and a new row is inserted with card_version incremented.
    The old HMAC signature is therefore invalidated automatically because
    qr_service.verify_qr_payload() checks card_version.
    """

    __tablename__ = "health_cards"
    __table_args__ = (
        sa.CheckConstraint(
            "status IN ('active', 'lost', 'reissued', 'revoked')",
            name="health_cards_status_check",
        ),
        # Composite unique: same patient can have multiple card rows
        # across reissues (v1, v2, …) but not two rows with the same version.
        # The business rule "only one active card" is enforced by the service
        # layer (generate_card idempotency check), not by a DB constraint.
        sa.UniqueConstraint(
            "patient_id",
            "card_version",
            name="uq_health_cards_patient_version",
        ),
        sa.Index("idx_cards_patient", "patient_id"),
        sa.Index("idx_cards_number", "card_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )
    # No column-level UNIQUE — see uq_health_cards_patient_version in __table_args__.
    # A patient may have multiple card rows across reissues; only one is 'active'
    # at a time (enforced by the service layer, not a DB constraint).
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "patients.id",
            name="fk_health_cards_patient_id_patients",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    card_number: Mapped[str] = mapped_column(sa.String(30), unique=True, nullable=False)
    # HMAC-SHA256 hex digest of canonical QR payload (patient_id + card_version)
    qr_payload_hash: Mapped[str] = mapped_column(sa.Text, nullable=False)
    # UID written to the physical NFC chip; nullable until the chip is provisioned
    nfc_uid: Mapped[str | None] = mapped_column(sa.String(64), unique=True, nullable=True)
    card_version: Mapped[int] = mapped_column(
        sa.Integer, nullable=False, server_default=sa.text("1")
    )
    status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default=sa.text("'active'"),
    )
    issued_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )
    expires_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True), nullable=True)
    issued_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        sa.ForeignKey(
            "users.id",
            name="fk_health_cards_issued_by_users",
        ),
        nullable=True,
    )
    # Async PDF generation status — set to "pending" when a generate task is
    # dispatched to Celery, "ready" when the PDF is on disk, "failed" on error.
    generation_status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default=sa.text("'pending'"),
    )
    # Relative file path or URL to the rendered PDF — populated by the Celery
    # task when generation_status transitions to "ready".  Never contains PHI.
    pdf_url: Mapped[str | None] = mapped_column(
        sa.Text,
        nullable=True,
        default=None,
    )

    # Relationships
    patient: Mapped["Patient"] = relationship(
        "Patient",
        back_populates="health_card",
        lazy="noload",
    )
    issued_by_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[issued_by],
        lazy="noload",
    )
    verifications: Mapped[list["CardVerification"]] = relationship(
        "CardVerification",
        back_populates="health_card",
        lazy="noload",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<HealthCard patient_id={self.patient_id} "
            f"card_number={self.card_number!r} version={self.card_version}>"
        )
