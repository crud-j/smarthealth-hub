"""
Admin-editable runtime settings (SDP §5.8): clinic name, reminder lead times
and SMS reminder templates.

Each value is the admin's override from ``system_settings`` when one exists,
otherwise the default (``.env`` via ``settings``, or the built-in template).
Defaults are read at call time, so changing ``.env`` still works for anything
an admin has not overridden.

Who reads these:
  - reminder_scheduler (appointment, immunization, missed-appointment SMS)
  - appointments.py manual reminder, intake.py pre-visit link SMS
  - system_config.py (System Configuration page, registration QR poster)

Every change is audited (UPDATE system_settings) with the old and new value.
No PHI is stored here.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.schemas.system_config import (
    SettingValue,
    SmsTemplateSetting,
    SystemSettingsResponse,
    SystemSettingsUpdate,
)
from app.services.audit_service import write_audit_log
from app.services.sms_templates import (
    APPOINTMENT_TEMPLATE_LIMIT,
    MAX_TEMPLATE_LENGTH,
    SAMPLE_VALUES,
    TEMPLATE_DEFAULTS,
    TEMPLATE_KINDS,
    TEMPLATE_LANGUAGES,
    TEMPLATE_PLACEHOLDERS,
    TEMPLATE_REQUIRED,
    render_template,
    template_key,
)

BHC_NAME = "bhc_name"
REMINDER_LEAD_HOURS = "sms_reminder_lead_hours"
IMMUNIZATION_LEAD_DAYS = "sms_immunization_lead_days"


def setting_defaults() -> dict[str, Any]:
    """Every editable key and its default (read now, so .env changes apply)."""
    defaults: dict[str, Any] = {
        BHC_NAME: settings.BHC_NAME,
        REMINDER_LEAD_HOURS: settings.SMS_REMINDER_LEAD_HOURS,
        IMMUNIZATION_LEAD_DAYS: settings.SMS_IMMUNIZATION_LEAD_DAYS,
    }
    for kind in TEMPLATE_KINDS:
        for lang in TEMPLATE_LANGUAGES:
            defaults[template_key(kind, lang)] = TEMPLATE_DEFAULTS[kind][lang]
    return defaults


@dataclass(frozen=True)
class RuntimeSettings:
    """The values in effect right now (overrides merged over defaults)."""

    values: dict[str, Any]
    custom_keys: frozenset[str] = field(default_factory=frozenset)

    @property
    def bhc_name(self) -> str:
        return str(self.values[BHC_NAME])

    @property
    def sms_reminder_lead_hours(self) -> int:
        return int(self.values[REMINDER_LEAD_HOURS])

    @property
    def sms_immunization_lead_days(self) -> int:
        return int(self.values[IMMUNIZATION_LEAD_DAYS])

    def render_sms(self, kind: str, lang: str | None, **values: object) -> str:
        """
        Fill the ``kind`` template for ``lang`` (English when the patient's
        language has no template). ``bhc_name`` is filled in automatically.
        """
        resolved = lang if lang in TEMPLATE_LANGUAGES else "en"
        text = self.values.get(template_key(kind, resolved))
        return render_template(kind, resolved, text, {"bhc_name": self.bhc_name, **values})


async def _overrides(db: AsyncSession) -> list[tuple[SystemSetting, str | None]]:
    rows = await db.execute(
        sa.select(SystemSetting, User.full_name).outerjoin(
            User, User.id == SystemSetting.updated_by
        )
    )
    return [(row[0], row[1]) for row in rows.all()]


async def load_runtime_settings(db: AsyncSession) -> RuntimeSettings:
    """Effective settings for this request / task (one small query)."""
    values = setting_defaults()
    custom: set[str] = set()
    for row, _ in await _overrides(db):
        if row.key in values:  # ignore keys this version no longer knows
            values[row.key] = row.value
            custom.add(row.key)
    return RuntimeSettings(values=values, custom_keys=frozenset(custom))


async def get_settings_view(db: AsyncSession) -> SystemSettingsResponse:
    """Everything the System Configuration page needs to edit the settings."""
    defaults = setting_defaults()
    meta: dict[str, tuple[Any, datetime | None, str | None]] = {}
    for row, editor in await _overrides(db):
        if row.key in defaults:
            meta[row.key] = (row.value, row.updated_at, editor)

    def item(key: str) -> dict[str, Any]:
        value, updated_at, editor = meta.get(key, (defaults[key], None, None))
        return {
            "value": value,
            "default": defaults[key],
            "is_custom": key in meta,
            "updated_at": updated_at,
            "updated_by": editor,
        }

    templates = [
        SmsTemplateSetting(
            **item(template_key(kind, lang)),
            kind=kind,
            language=lang,
            placeholders=list(TEMPLATE_PLACEHOLDERS[kind]),
            required=list(TEMPLATE_REQUIRED[kind]),
            max_length=MAX_TEMPLATE_LENGTH,
            send_limit=APPOINTMENT_TEMPLATE_LIMIT if kind == "appointment_reminder" else None,
        )
        for kind in TEMPLATE_KINDS
        for lang in TEMPLATE_LANGUAGES
    ]
    bhc = item(BHC_NAME)
    return SystemSettingsResponse(
        bhc_name=SettingValue(**bhc),
        sms_reminder_lead_hours=SettingValue(**item(REMINDER_LEAD_HOURS)),
        sms_immunization_lead_days=SettingValue(**item(IMMUNIZATION_LEAD_DAYS)),
        sms_templates=templates,
        sample_values={**SAMPLE_VALUES, "bhc_name": str(bhc["value"])},
    )


def requested_changes(body: SystemSettingsUpdate) -> dict[str, Any]:
    """Map the request body to ``{key: new value or None (= reset)}``."""
    changes: dict[str, Any] = {}
    for name in (BHC_NAME, REMINDER_LEAD_HOURS, IMMUNIZATION_LEAD_DAYS):
        if name in body.model_fields_set:
            changes[name] = getattr(body, name)
    for dotted, text in (body.sms_templates or {}).items():
        kind, _, lang = dotted.partition(".")
        changes[template_key(kind, lang)] = text
    return changes


async def update_settings(
    db: AsyncSession,
    body: SystemSettingsUpdate,
    *,
    updated_by: uuid.UUID,
    ip_address: str | None = None,
) -> SystemSettingsResponse:
    """
    Apply an admin's changes. ``None`` (or a value equal to the default)
    removes the override. Writes one audit row listing each value that
    actually changed (old → new); nothing is written for a no-op save.
    """
    defaults = setting_defaults()
    current = await load_runtime_settings(db)
    rows = {row.key: row for row, _ in await _overrides(db)}

    # updated_at is set here, not by the DB default, so the ORM object always
    # holds a real value (no reload needed after commit).
    now = datetime.now(tz=UTC)
    audit_changes: dict[str, dict[str, Any]] = {}
    for key, new in requested_changes(body).items():
        before = current.values[key]
        if new is None or new == defaults[key]:
            after = defaults[key]
            if key in rows:
                await db.delete(rows[key])
        else:
            after = new
            if key not in rows:
                db.add(SystemSetting(key=key, value=new, updated_by=updated_by, updated_at=now))
            elif rows[key].value != new:
                rows[key].value = new
                rows[key].updated_by = updated_by
                rows[key].updated_at = now
        if after != before:
            audit_changes[key] = {"from": before, "to": after}

    if audit_changes:
        await write_audit_log(
            db=db,
            action="UPDATE",
            entity_type="system_settings",
            user_id=updated_by,
            metadata={"changes": audit_changes},
            ip_address=ip_address,
        )
    await db.commit()
    return await get_settings_view(db)
