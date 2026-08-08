"""
Intake service — token generation, draft save, and finalize logic.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.models.intake_token import PatientIntakeToken
from app.models.patient import Patient
from app.schemas.patient import PatientCreate

logger = get_logger(__name__)

_INTAKE_TOKEN_EXPIRY_HOURS = 48


async def generate_intake_token(
    db: AsyncSession,
    created_by_id: uuid.UUID,
    base_url: str,
) -> PatientIntakeToken:
    token_uuid = uuid.uuid4()
    expires_at = datetime.now(UTC) + timedelta(hours=_INTAKE_TOKEN_EXPIRY_HOURS)

    intake_token = PatientIntakeToken(
        id=uuid.uuid4(),
        token=token_uuid,
        created_by_id=created_by_id,
        expires_at=expires_at,
    )
    db.add(intake_token)
    await db.commit()
    await db.refresh(intake_token)

    logger.info(
        "Intake token generated",
        extra={
            "token": str(token_uuid),
            "created_by_id": str(created_by_id),
            "expires_at": expires_at.isoformat(),
        },
    )
    return intake_token


async def get_intake_token(
    db: AsyncSession,
    token_str: str,
) -> PatientIntakeToken:
    try:
        token_uuid = uuid.UUID(token_str)
    except ValueError as exc:
        raise NotFoundError(f"Invalid token format: {token_str}") from exc

    result = await db.execute(
        sa.select(PatientIntakeToken).where(PatientIntakeToken.token == token_uuid)
    )
    intake_token: PatientIntakeToken | None = result.scalar_one_or_none()

    if intake_token is None:
        raise NotFoundError(f"Intake token not found: {token_str}")

    now = datetime.now(UTC)
    if intake_token.expires_at < now:
        raise ValueError("This intake link has expired. Please ask the health center to send a new link.")

    if intake_token.used_at is not None:
        raise ValueError("This intake link has already been used. Please contact the health center.")

    return intake_token


async def save_draft(
    db: AsyncSession,
    token_str: str,
    draft_data: dict[str, Any],
) -> PatientIntakeToken:
    intake_token = await get_intake_token(db, token_str)
    intake_token.draft_data = draft_data
    await db.commit()
    await db.refresh(intake_token)
    return intake_token


async def list_pending_intakes(
    db: AsyncSession,
) -> list[PatientIntakeToken]:
    """Return all non-expired, non-used intake tokens (with or without draft data)."""
    now = datetime.now(UTC)
    result = await db.execute(
        sa.select(PatientIntakeToken)
        .where(
            PatientIntakeToken.used_at.is_(None),
            PatientIntakeToken.expires_at > now,
        )
        .order_by(PatientIntakeToken.created_at.desc())
    )
    return list(result.scalars().all())


async def finalize_intake(
    db: AsyncSession,
    token_str: str,
    created_by_id: uuid.UUID,
    ip_address: str | None = None,
) -> Patient:
    from app.services import patient_service  # noqa: PLC0415

    intake_token = await get_intake_token(db, token_str)

    if not intake_token.draft_data:
        raise ValueError(
            "No draft data found for this intake token. "
            "The patient must submit the form before finalization."
        )

    draft_with_source = dict(intake_token.draft_data)
    draft_with_source["registration_data_source"] = "pre_visit"
    draft_with_source["confirm_duplicate"] = False

    try:
        patient_data = PatientCreate.model_validate(draft_with_source)
    except Exception as exc:
        raise ValueError(f"Draft data is invalid: {exc}") from exc

    # create_patient always returns tuple[Patient | None, list[Patient]]:
    #   (patient, [])      on success
    #   (None, matches)    on unconfirmed duplicate
    patient, _matches = await patient_service.create_patient(
        db=db,
        data=patient_data,
        created_by_id=created_by_id,
        ip_address=ip_address,
        confirm_duplicate=False,
    )

    if patient is None:
        raise ValueError(
            "A duplicate patient was detected. The staff member must review and confirm."
        )

    intake_token.used_at = datetime.now(UTC)
    intake_token.patient_id = patient.id
    await db.commit()

    logger.info(
        "Intake finalized",
        extra={
            "token": token_str,
            "patient_id": str(patient.id),
            "patient_code": patient.patient_code,
        },
    )
    return patient
