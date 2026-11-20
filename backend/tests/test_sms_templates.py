"""
Rules for admin-editable SMS templates (app.services.sms_templates).

DB-free: runs with ``--noconftest``.

Templates are Python format strings. Only the placeholders a message type
provides are allowed; anything else (attribute access, indexing, format
specs, positional fields) is rejected because ``str.format`` could otherwise
read internal attributes. Rendering never raises: a broken stored template
falls back to the built-in default so reminders keep going out.
"""

from __future__ import annotations

import pytest

from app.services.sms_templates import (
    TEMPLATE_DEFAULTS,
    TEMPLATE_KINDS,
    render_template,
    template_key,
    template_problems,
)


def test_every_default_template_passes_its_own_rules() -> None:
    for kind, by_lang in TEMPLATE_DEFAULTS.items():
        for lang, text in by_lang.items():
            assert template_problems(kind, text) == [], (kind, lang)


def test_kinds_and_languages() -> None:
    assert set(TEMPLATE_KINDS) == {
        "appointment_reminder",
        "immunization_reminder",
        "missed_appointment",
    }
    for by_lang in TEMPLATE_DEFAULTS.values():
        assert set(by_lang) == {"en", "fil"}
    assert template_key("appointment_reminder", "fil") == "sms_template.appointment_reminder.fil"


def test_accepts_allowed_placeholders_and_literal_braces() -> None:
    text = "Hi {patient_name}, {appointment_type} on {scheduled_date} {scheduled_time} at {bhc_name} {{ok}}"
    assert template_problems("appointment_reminder", text) == []


@pytest.mark.parametrize(
    ("text", "problem"),
    [
        (
            "Hi {patient_name}, {scheduled_date} {scheduled_time} {secret}",
            "Unknown placeholder {secret}",
        ),
        (
            "{patient_name.__class__} {scheduled_date} {scheduled_time}",
            "Unknown placeholder {patient_name.__class__}",
        ),
        (
            "{patient_name[0]} {scheduled_date} {scheduled_time}",
            "Unknown placeholder {patient_name[0]}",
        ),
        ("{} {scheduled_date} {scheduled_time}", "Unknown placeholder {}"),
        (
            "{patient_name!r} {scheduled_date} {scheduled_time}",
            "{patient_name} cannot have formatting",
        ),
        (
            "{patient_name:>20} {scheduled_date} {scheduled_time}",
            "{patient_name} cannot have formatting",
        ),
        ("Hi {patient_name {scheduled_date} {scheduled_time}", "Unmatched { or }"),
        ("Hi } {scheduled_date} {scheduled_time}", "Unmatched { or }"),
    ],
)
def test_rejects_unsafe_or_broken_placeholders(text: str, problem: str) -> None:
    assert problem in " | ".join(template_problems("appointment_reminder", text))


def test_requires_the_essential_placeholders() -> None:
    problems = template_problems("appointment_reminder", "Hi {patient_name}, see you soon.")
    assert "Must include {scheduled_date}" in problems
    assert "Must include {scheduled_time}" in problems

    problems = template_problems("immunization_reminder", "Hi {patient_name}.")
    assert "Must include {vaccine_name}" in problems
    assert "Must include {due_date}" in problems

    assert template_problems("missed_appointment", "Please call us to reschedule.") == []


def test_placeholders_are_per_message_type() -> None:
    # {vaccine_name} belongs to immunization reminders, not missed appointments.
    problems = " | ".join(
        template_problems("missed_appointment", "Hi {first_name}, {vaccine_name}")
    )
    assert "Unknown placeholder {vaccine_name}. Use: {first_name}, {bhc_name}" in problems


@pytest.mark.parametrize("text", ["", "   "])
def test_rejects_empty(text: str) -> None:
    assert "Cannot be empty" in template_problems("missed_appointment", text)


def test_rejects_over_480_characters() -> None:
    assert "At most 480 characters" in template_problems("missed_appointment", "x" * 481)


def test_render_fills_values() -> None:
    out = render_template(
        "missed_appointment",
        "en",
        "Hi {first_name}, call {bhc_name}. {{x}}",
        {"first_name": "Ana", "bhc_name": "BHC Uno"},
    )
    assert out == "Hi Ana, call BHC Uno. {x}"


def test_render_falls_back_to_default_on_a_broken_template() -> None:
    """A bad value that slipped into the DB must not stop reminders."""
    values = {"first_name": "Ana", "bhc_name": "BHC Uno"}
    out = render_template("missed_appointment", "fil", "Hi {first_name.__class__}", values)
    assert out == TEMPLATE_DEFAULTS["missed_appointment"]["fil"].format(**values)


def test_render_unknown_language_uses_english() -> None:
    out = render_template("missed_appointment", "xx", None, {"first_name": "Ana", "bhc_name": "B"})
    assert out == TEMPLATE_DEFAULTS["missed_appointment"]["en"].format(
        first_name="Ana", bhc_name="B"
    )
