"""
SMS reminder templates: built-in defaults and the rules for admin edits.

Templates are Python format strings filled by the reminder scheduler. An admin
can override any of them on the System Configuration page (stored in
``system_settings`` under ``template_key(kind, lang)``); a missing row means
the default below is used.

Safety rules (``template_problems``), enforced on save:
  - Only the placeholders that message type provides (``TEMPLATE_PLACEHOLDERS``)
    — never attribute access ``{x.y}``, indexing ``{x[0]}``, positional ``{}``,
    conversions ``{x!r}`` or format specs ``{x:>9}``. ``str.format`` would
    otherwise let a template read internal attributes.
  - The placeholders that make the message useful (``TEMPLATE_REQUIRED``).
  - 1-480 characters (3 SMS parts).

``render_template`` never raises: a template that is somehow invalid falls
back to the built-in default, so a typo can never stop reminders.
"""

from __future__ import annotations

import logging
from string import Formatter

logger = logging.getLogger(__name__)

TEMPLATE_KINDS: tuple[str, ...] = (
    "appointment_reminder",
    "immunization_reminder",
    "missed_appointment",
)
TEMPLATE_LANGUAGES: tuple[str, ...] = ("en", "fil")
MAX_TEMPLATE_LENGTH = 480

TEMPLATE_DEFAULTS: dict[str, dict[str, str]] = {
    "appointment_reminder": {
        "en": (
            "Hi {patient_name}, this is a reminder for your {appointment_type} "
            "appointment at {bhc_name} on {scheduled_date} at "
            "{scheduled_time}. Please arrive 15 minutes early. "
            "Reply STOP to unsubscribe."
        ),
        "fil": (
            "Kamusta {patient_name}, paalala: mayroon kang {appointment_type} "
            "na appointment sa {bhc_name} sa {scheduled_date} ng {scheduled_time}. "
            "Sagutin ng STOP para mag-opt out."
        ),
    },
    "immunization_reminder": {
        "en": (
            "Hi {patient_name}, your {vaccine_name} immunization is due on "
            "{due_date} at {bhc_name}. Please bring your health "
            "card. Reply STOP to unsubscribe."
        ),
        "fil": (
            "Kamusta {patient_name}, ang {vaccine_name} (dose {dose_number}) "
            "para kay {patient_name} ay dapat ibigay sa {due_date}. "
            "Pakidalaw ang {bhc_name}."
        ),
    },
    "missed_appointment": {
        "en": (
            "Hi {first_name}, we noticed you missed your appointment today. "
            "Please contact {bhc_name} to reschedule."
        ),
        "fil": (
            "Kamusta {first_name}, napansin namin na hindi ka dumating sa "
            "iyong appointment ngayon. Makipag-ugnayan sa {bhc_name} para mag-reschedule."
        ),
    },
}

TEMPLATE_PLACEHOLDERS: dict[str, tuple[str, ...]] = {
    "appointment_reminder": (
        "patient_name",
        "appointment_type",
        "scheduled_date",
        "scheduled_time",
        "bhc_name",
    ),
    "immunization_reminder": (
        "patient_name",
        "vaccine_name",
        "dose_number",
        "due_date",
        "bhc_name",
    ),
    "missed_appointment": ("first_name", "bhc_name"),
}

TEMPLATE_REQUIRED: dict[str, tuple[str, ...]] = {
    "appointment_reminder": ("scheduled_date", "scheduled_time"),
    "immunization_reminder": ("vaccine_name", "due_date"),
    "missed_appointment": (),
}

# Appointment reminders get " CONFIRM 1234 to confirm." appended and the
# whole SMS kept to 160 characters, so the template part is cut at 135.
APPOINTMENT_TEMPLATE_LIMIT = 135

# Fictional values for the live preview on the settings page.
SAMPLE_VALUES: dict[str, str] = {
    "patient_name": "Juan Dela Cruz",
    "first_name": "Juan",
    "appointment_type": "consultation",
    "scheduled_date": "12/01/2026",
    "scheduled_time": "09:00 AM",
    "vaccine_name": "Measles (MMR)",
    "dose_number": "1",
    "due_date": "12/04/2026",
}


def template_key(kind: str, lang: str) -> str:
    """The ``system_settings`` key for one template."""
    return f"sms_template.{kind}.{lang}"


def template_problems(kind: str, text: str) -> list[str]:
    """Everything wrong with ``text`` as a ``kind`` template; [] if it is valid."""
    if not text.strip():
        return ["Cannot be empty"]

    problems: list[str] = []
    if len(text) > MAX_TEMPLATE_LENGTH:
        problems.append(f"At most {MAX_TEMPLATE_LENGTH} characters")

    allowed = TEMPLATE_PLACEHOLDERS[kind]
    used: set[str] = set()
    try:
        parsed = list(Formatter().parse(text))
    except ValueError:
        return [*problems, "Unmatched { or } (write {{ or }} for a literal brace)"]

    for _literal, field, spec, conversion in parsed:
        if field is None:
            continue
        if field not in allowed:
            problems.append(
                f"Unknown placeholder {{{field}}}. Use: " + ", ".join(f"{{{p}}}" for p in allowed)
            )
            continue
        if spec or conversion:
            problems.append(f"{{{field}}} cannot have formatting")
        used.add(field)

    for name in TEMPLATE_REQUIRED[kind]:
        if name not in used:
            problems.append(f"Must include {{{name}}}")
    return problems


def default_template(kind: str, lang: str) -> str:
    by_lang = TEMPLATE_DEFAULTS[kind]
    return by_lang.get(lang, by_lang["en"])


def render_template(kind: str, lang: str, text: str | None, values: dict[str, object]) -> str:
    """
    Fill ``text`` (or the default when None) for one message.

    ``lang`` not in the registry falls back to English. An invalid template
    or a format error falls back to the default template for ``lang``.
    """
    if lang not in TEMPLATE_DEFAULTS[kind]:
        lang = "en"
    fallback = default_template(kind, lang)
    if text is None:
        return fallback.format(**values)
    if template_problems(kind, text):
        logger.warning("SMS template %s.%s is invalid; using the default", kind, lang)
        return fallback.format(**values)
    try:
        return text.format(**values)
    except (KeyError, IndexError, ValueError):
        logger.warning("SMS template %s.%s failed to render; using the default", kind, lang)
        return fallback.format(**values)
