"""
Approving a public intake application keeps the applicant's house no. / street.

The /register and /intake forms collect ``house_street``.  Approval used to put
it only into a composed address that ``create_patient`` then threw away
(barangay/municipality were always filled), so the text never reached the
patient record or the card.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.intake_application import IntakeApplication
from app.services.intake_application_service import approve_application


def _form_data(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "first_name": "Ana",
        "last_name": "Reyes",
        "birth_date": "1992-04-10",
        "sex": "female",
        "house_street": "123 Rosal St., near the chapel",
        "barangay": "Patubig",
        "municipality": "Marilao",
        "province": "Bulacan",
        "emergency_contact_name": "Ben Reyes",
        "emergency_contact_number": "09171234567",
    }
    data.update(overrides)
    return data


async def _approve(db_session: AsyncSession, make_user: Any, form_data: dict[str, Any]) -> Any:
    reviewer = await make_user(role_name="admin")
    application = IntakeApplication(
        reference_number=f"INT-{uuid.uuid4().hex[:8].upper()}",
        status="pending",
        form_data=form_data,
    )
    db_session.add(application)
    await db_session.commit()
    await db_session.refresh(application)

    return await approve_application(db_session, application.id, reviewed_by_id=reviewer.id)


async def test_approve_keeps_house_street(db_session: AsyncSession, make_user: Any) -> None:
    patient = await _approve(db_session, make_user, _form_data())

    assert patient.house_street == "123 Rosal St., near the chapel"
    assert patient.address == "123 Rosal St., near the chapel, Patubig, Marilao, Bulacan"


async def test_approve_without_house_street(db_session: AsyncSession, make_user: Any) -> None:
    patient = await _approve(db_session, make_user, _form_data(house_street=None))

    assert patient.house_street is None
    assert patient.address == "Patubig, Marilao, Bulacan"
