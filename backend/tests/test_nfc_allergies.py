"""
Allergies on every health-card surface.

``patients.allergies`` is stored AES-256-GCM encrypted (patient_service
encrypts it on every write).  ``_patient_allergies`` is the single place that
turns the stored value back into readable text, and ``_card_allergies`` adds
the shared empty-state text.

Every surface must show the same value, taken from ``patients.allergies``:
  - the NFC tap view page and the relay-monitor payload (``_patient_allergies``),
  - the printed card PDF, single and batch (``_card_allergies``),
  - the NFC UID scan payload (``_card_allergies``).
The card PDF and UID scan used to list every ``medical_histories.condition_name``
as "allergies" (e.g. "Hypertension") and ignored the real allergies field.

No database needed: the helpers only read attributes of transient models.
"""

from __future__ import annotations

from app.api.v1.endpoints.health_cards import (
    _NO_ALLERGIES_TEXT,
    _card_allergies,
    _patient_allergies,
    _render_nfc_view_html,
)
from app.models.health_card import HealthCard
from app.models.medical_history import MedicalHistory
from app.models.patient import Patient
from app.utils.encryption import encrypt_text


def test_patient_allergies_decrypts_stored_ciphertext() -> None:
    stored = encrypt_text("Penicillin, shellfish")
    # Guard: the test environment must really encrypt, or this test proves nothing.
    assert stored != "Penicillin, shellfish"

    assert _patient_allergies(Patient(allergies=stored)) == "Penicillin, shellfish"


def test_patient_allergies_legacy_plaintext_returned_unchanged() -> None:
    assert _patient_allergies(Patient(allergies="Sulfa drugs")) == "Sulfa drugs"


def test_patient_allergies_missing_is_none() -> None:
    assert _patient_allergies(Patient(allergies=None)) is None
    assert _patient_allergies(Patient(allergies="")) is None


# ── Card PDF + UID scan: _card_allergies ─────────────────────────────────────


def test_card_allergies_uses_decrypted_patient_allergies() -> None:
    patient = Patient(allergies=encrypt_text("Penicillin, Shrimp"))

    assert _card_allergies(patient) == "Penicillin, Shrimp"


def test_card_allergies_ignores_medical_history_conditions() -> None:
    # A chronic condition is not an allergy and must not be printed as one.
    patient = Patient(
        allergies=None,
        medical_histories=[MedicalHistory(condition_name="Hypertension")],
    )

    assert _card_allergies(patient) == _NO_ALLERGIES_TEXT


def test_card_allergies_prefers_allergies_over_conditions() -> None:
    patient = Patient(
        allergies=encrypt_text("Penicillin"),
        medical_histories=[MedicalHistory(condition_name="Type 2 Diabetes")],
    )

    assert _card_allergies(patient) == "Penicillin"


def test_card_allergies_missing_uses_shared_empty_text() -> None:
    assert _card_allergies(Patient(allergies=None)) == "None on record"
    assert _card_allergies(Patient(allergies="")) == "None on record"


# ── NFC tap view page: same empty text as the card ──────────────────────────


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


def test_tap_view_without_allergies_uses_shared_empty_text() -> None:
    html = _render_tap_view(Patient(allergies=None))

    assert _NO_ALLERGIES_TEXT in html
    assert "None recorded." not in html


def test_tap_view_shows_decrypted_allergies() -> None:
    html = _render_tap_view(Patient(allergies=encrypt_text("Penicillin, Shrimp")))

    assert "Penicillin, Shrimp" in html
