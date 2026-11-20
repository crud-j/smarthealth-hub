"""
The patient address rule: one rule for saving and for every display.

Registration used to drop the "Home Address / Landmark" text (house no.,
street, landmark) whenever barangay / municipality / province were filled in:
``_compose_address`` kept only the structured parts.  ``patients.house_street``
now stores that text and ``compose_address`` puts it first.

``patient_address(patient)`` is what the card back, the NFC tap view and the
summary PDF print, so they can never disagree with what was saved.  The
frontend mirror is ``effectiveAddress`` in ``frontend/web/lib/schemas/patient.ts``
(tests: ``frontend/web/tests/lib/patient-edit-schema.test.ts``).

No database needed: these only read attributes of transient models.
"""

from __future__ import annotations

from app.api.v1.endpoints.health_cards import _render_nfc_view_html
from app.models.health_card import HealthCard
from app.models.patient import Patient
from app.services.patient_service import compose_address, patient_address

# ── compose_address ──────────────────────────────────────────────────────────


def test_house_street_comes_first_before_the_structured_parts() -> None:
    assert (
        compose_address(
            address="ignored free text",
            house_street="Blk 4 Lot 2 Rosal St., near the chapel",
            sitio_purok="Purok 3",
            barangay="Patubig",
            municipality="Marilao",
            province="Bulacan",
        )
        == "Blk 4 Lot 2 Rosal St., near the chapel, Purok 3, Patubig, Marilao, Bulacan"
    )


def test_structured_parts_without_house_street_unchanged() -> None:
    # The rule the Edit page preview and test_patients.py already rely on.
    assert (
        compose_address(
            address="123 Rizal St.",
            sitio_purok="Purok 2",
            barangay="Turo",
            municipality="Bocaue",
            province="Bulacan",
        )
        == "Purok 2, Turo, Bocaue, Bulacan"
    )


def test_blank_parts_are_skipped_and_parts_are_trimmed() -> None:
    assert (
        compose_address(
            address=None,
            house_street="  123 Rizal St.  ",
            sitio_purok=" ",
            barangay="Turo",
            municipality="",
            province=" Bulacan ",
        )
        == "123 Rizal St., Turo, Bulacan"
    )


def test_free_text_address_used_when_no_location_part() -> None:
    # Older / seeded patients only have the free-text address.  A house/street
    # alone does not replace it (it would throw the free text away).
    assert (
        compose_address(address=" 123 Rizal St., Marilao ", house_street="Lot 5")
        == "123 Rizal St., Marilao"
    )


def test_house_street_is_the_fallback_when_nothing_else() -> None:
    assert compose_address(address=None, house_street=" Lot 5 ") == "Lot 5"
    assert compose_address(address="  ", house_street=None) == ""


# ── patient_address: what every display prints ──────────────────────────────


def test_patient_address_includes_house_street() -> None:
    patient = Patient(
        address="Patubig, Marilao, Bulacan",  # stored before house_street existed
        house_street="123 Rosal St.",
        barangay="Patubig",
        municipality="Marilao",
        province="Bulacan",
    )

    assert patient_address(patient) == "123 Rosal St., Patubig, Marilao, Bulacan"


def test_patient_address_free_text_only_patient() -> None:
    assert patient_address(Patient(address="123 Test Street, Manila")) == "123 Test Street, Manila"


# ── NFC tap view ─────────────────────────────────────────────────────────────


def _render_tap_view(patient: Patient) -> str:
    return _render_nfc_view_html(
        patient=patient,
        card=HealthCard(status="active", issued_at=None),
        full_name="Test Patient",
        age=30,
        dob_str="January 1, 1996",
        conditions=[],
        latest_visit=None,
        next_appointment=None,
        last_appointment=None,
        last_immunization=None,
        scanned_at_str="Nov 20, 2026",
    )


def test_tap_view_shows_house_street() -> None:
    html = _render_tap_view(
        Patient(
            address="Patubig, Marilao, Bulacan",
            house_street="123 Rosal St.",
            barangay="Patubig",
            municipality="Marilao",
            province="Bulacan",
        )
    )

    assert "123 Rosal St., Patubig, Marilao, Bulacan" in html


def test_tap_view_escapes_address_parts() -> None:
    # Barangay and house/street text can come from the public intake form.
    html = _render_tap_view(
        Patient(
            address="x",
            house_street='<img src=x onerror="alert(1)">',
            barangay="<script>alert(1)</script>",
        )
    )

    assert "<script>alert(1)</script>" not in html
    assert "<img src=x" not in html
    assert "&lt;script&gt;" in html
