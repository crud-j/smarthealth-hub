/**
 * Admin-editable system settings (GET/PUT /system/settings): types, the
 * editable draft, client-side checks and the minimal update payload.
 *
 * Backend: `app/schemas/system_config.py` (SystemSettingsResponse /
 * SystemSettingsUpdate). Omitted fields are left alone; `null` resets a value
 * to its default. The backend validates everything again.
 */

import { templateProblems } from "@/lib/sms-template"

export interface SettingValue<T> {
  value: T
  default: T
  is_custom: boolean
  updated_at: string | null
  updated_by: string | null
}

export interface SmsTemplateSetting extends SettingValue<string> {
  kind: string
  language: string
  placeholders: string[]
  required: string[]
  max_length: number
  send_limit: number | null
}

export interface SystemSettings {
  bhc_name: SettingValue<string>
  sms_reminder_lead_hours: SettingValue<number>
  sms_immunization_lead_days: SettingValue<number>
  sms_templates: SmsTemplateSetting[]
  sample_values: Record<string, string>
}

export interface SettingsDraft {
  bhcName: string
  /** Kept as typed so a half-typed number is not lost; checked by draftProblems. */
  leadHours: string
  leadDays: string
  /** Keyed "<kind>.<language>", e.g. "appointment_reminder.fil". */
  templates: Record<string, string>
}

export interface SettingsUpdate {
  bhc_name?: string | null
  sms_reminder_lead_hours?: number | null
  sms_immunization_lead_days?: number | null
  sms_templates?: Record<string, string | null>
}

export const templateId = (t: { kind: string; language: string }): string => `${t.kind}.${t.language}`

export function draftFrom(s: SystemSettings): SettingsDraft {
  return {
    bhcName: s.bhc_name.value,
    leadHours: String(s.sms_reminder_lead_hours.value),
    leadDays: String(s.sms_immunization_lead_days.value),
    templates: Object.fromEntries(s.sms_templates.map((t) => [templateId(t), t.value])),
  }
}

/** undefined = unchanged (omit), null = back to default, otherwise the new value. */
function change<T>(setting: SettingValue<T>, next: T): T | null | undefined {
  if (next === setting.value) return undefined
  if (next === setting.default) return null
  return next
}

export function buildSettingsUpdate(s: SystemSettings, draft: SettingsDraft): SettingsUpdate {
  const update: SettingsUpdate = {}
  const name = change(s.bhc_name, draft.bhcName.trim())
  if (name !== undefined) update.bhc_name = name
  const hours = change(s.sms_reminder_lead_hours, Number(draft.leadHours))
  if (hours !== undefined) update.sms_reminder_lead_hours = hours
  const days = change(s.sms_immunization_lead_days, Number(draft.leadDays))
  if (days !== undefined) update.sms_immunization_lead_days = days

  const templates: Record<string, string | null> = {}
  for (const t of s.sms_templates) {
    const id = templateId(t)
    const next = change(t, (draft.templates[id] ?? t.value).trim())
    if (next !== undefined) templates[id] = next
  }
  if (Object.keys(templates).length > 0) update.sms_templates = templates
  return update
}

function wholeNumberIn(text: string, min: number, max: number): boolean {
  return /^\d+$/.test(text.trim()) && Number(text) >= min && Number(text) <= max
}

/** Problems by field ("bhcName", "leadHours", "leadDays" or a template id); {} if none. */
export function draftProblems(s: SystemSettings, draft: SettingsDraft): Record<string, string[]> {
  const problems: Record<string, string[]> = {}
  const name = draft.bhcName.trim()
  if (name.length < 2 || name.length > 120) problems.bhcName = ["Clinic name must be 2-120 characters"]
  if (!wholeNumberIn(draft.leadHours, 1, 168)) problems.leadHours = ["Whole number from 1 to 168"]
  if (!wholeNumberIn(draft.leadDays, 0, 30)) problems.leadDays = ["Whole number from 0 to 30"]
  for (const t of s.sms_templates) {
    const id = templateId(t)
    const found = templateProblems((draft.templates[id] ?? t.value).trim(), {
      placeholders: t.placeholders,
      required: t.required,
      maxLength: t.max_length,
    })
    if (found.length > 0) problems[id] = found
  }
  return problems
}
