"""Card PDFs are no longer stored: every card is 'ready', pdf_url cleared.

A Celery task used to write each generated card to
media/health_cards/<card_id>.pdf (patient data on disk and in every media
backup) and move generation_status pending -> ready.  Nothing has served those
files since the public /media mount was removed; GET /health-cards/{id}/pdf
renders the card on demand (login required).  The task is gone.

- generation_status: server default 'ready'; existing rows set to 'ready'.
- pdf_url: cleared (it pointed at the stored files).

The files themselves are deleted by backend/scripts/purge_stored_card_pdfs.py
(a migration should not delete files).

Downgrade restores the 'pending' default only; the old statuses and paths are
not recoverable and nothing needs them.

Revision ID: 0030
Revises: 0029
Create Date: 2026-11-20
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("health_cards", "generation_status", server_default=sa.text("'ready'"))
    op.execute(
        """
        UPDATE health_cards
        SET generation_status = 'ready', pdf_url = NULL
        WHERE generation_status <> 'ready' OR pdf_url IS NOT NULL
        """
    )


def downgrade() -> None:
    op.alter_column("health_cards", "generation_status", server_default=sa.text("'pending'"))
