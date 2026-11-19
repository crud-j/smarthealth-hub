"""
Allergies on the NFC tap view and the NFC relay monitor.

``patients.allergies`` is stored AES-256-GCM encrypted (patient_service
encrypts it on every write).  The NFC view page and the relay-monitor payload
used to print the raw column, i.e. ciphertext.  ``_patient_allergies`` is the
single place that turns the stored value back into readable text.

No database needed: the helper only reads the attribute of a transient Patient.
"""

from __future__ import annotations

from app.api.v1.endpoints.health_cards import _patient_allergies
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
