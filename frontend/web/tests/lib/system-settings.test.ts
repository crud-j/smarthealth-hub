import { describe, expect, it } from "vitest"
import {
  buildSettingsUpdate,
  draftFrom,
  draftProblems,
  type SmsTemplateSetting,
  type SystemSettings,
} from "@/lib/system-settings"

function template(kind: string, language: string, value: string, def = value): SmsTemplateSetting {
  return {
    kind, language, value, default: def, is_custom: value !== def,
    updated_at: null, updated_by: null,
    placeholders: ["first_name", "bhc_name"], required: [], max_length: 480, send_limit: null,
  }
}

function settings(overrides: Partial<SystemSettings> = {}): SystemSettings {
  return {
    bhc_name: { value: "BHC Uno", default: "Barangay Health Center", is_custom: true, updated_at: null, updated_by: "Admin" },
    sms_reminder_lead_hours: { value: 24, default: 24, is_custom: false, updated_at: null, updated_by: null },
    sms_immunization_lead_days: { value: 3, default: 3, is_custom: false, updated_at: null, updated_by: null },
    clinic_open_time: { value: "07:00", default: "07:00", is_custom: false, updated_at: null, updated_by: null },
    clinic_close_time: { value: "17:00", default: "17:00", is_custom: false, updated_at: null, updated_by: null },
    sms_templates: [
      template("missed_appointment", "en", "Hi {first_name}"),
      template("missed_appointment", "fil", "Custom {first_name}", "Kamusta {first_name}"),
    ],
    sample_values: { first_name: "Juan", bhc_name: "BHC Uno" },
    ...overrides,
  }
}

describe("draftFrom / buildSettingsUpdate", () => {
  it("an untouched draft sends nothing", () => {
    const s = settings()
    expect(buildSettingsUpdate(s, draftFrom(s))).toEqual({})
  })

  it("sends only what changed", () => {
    const s = settings()
    const draft = draftFrom(s)
    draft.leadHours = "48"
    draft.templates["missed_appointment.en"] = "Hello {first_name}"
    expect(buildSettingsUpdate(s, draft)).toEqual({
      sms_reminder_lead_hours: 48,
      sms_templates: { "missed_appointment.en": "Hello {first_name}" },
    })
  })

  it("sends null when a custom value goes back to its default", () => {
    const s = settings()
    const draft = draftFrom(s)
    draft.bhcName = "Barangay Health Center"
    draft.templates["missed_appointment.fil"] = "Kamusta {first_name}"
    expect(buildSettingsUpdate(s, draft)).toEqual({
      bhc_name: null,
      sms_templates: { "missed_appointment.fil": null },
    })
  })

  it("trims the clinic name and templates before comparing", () => {
    const s = settings()
    const draft = draftFrom(s)
    draft.bhcName = "  BHC Uno  "
    draft.templates["missed_appointment.en"] = "  Hi {first_name}  "
    expect(buildSettingsUpdate(s, draft)).toEqual({})
  })
})

describe("draftProblems", () => {
  it("is empty for a valid draft", () => {
    const s = settings()
    expect(draftProblems(s, draftFrom(s))).toEqual({})
  })

  it("checks the name, the lead times and every template", () => {
    const s = settings()
    const draft = draftFrom(s)
    draft.bhcName = "x"
    draft.leadHours = "0"
    draft.leadDays = "2.5"
    draft.templates["missed_appointment.en"] = "Hi {nope}"
    expect(draftProblems(s, draft)).toEqual({
      bhcName: ["Clinic name must be 2-120 characters"],
      leadHours: ["Whole number from 1 to 168"],
      leadDays: ["Whole number from 0 to 30"],
      "missed_appointment.en": ["Unknown placeholder {nope}. Use: {first_name}, {bhc_name}"],
    })
  })

  it("needs clinic hours as times with closing after opening", () => {
    const s = settings()
    const draft = draftFrom(s)
    draft.openTime = ""
    expect(draftProblems(s, draft).openTime).toEqual(["Pick an opening time"])

    draft.openTime = "18:00"
    expect(draftProblems(s, draft).closeTime).toEqual(["Closing time must be after the opening time"])

    draft.openTime = "08:00"
    draft.closeTime = "08:00"
    expect(draftProblems(s, draft).closeTime).toEqual(["Closing time must be after the opening time"])
  })
})

describe("clinic hours", () => {
  it("start from the saved hours", () => {
    const draft = draftFrom(settings())
    expect(draft.openTime).toBe("07:00")
    expect(draft.closeTime).toBe("17:00")
  })

  it("send only the hours that changed, and null to go back to the default", () => {
    const s = settings({
      clinic_close_time: { value: "16:00", default: "17:00", is_custom: true, updated_at: null, updated_by: "Admin" },
    })
    const draft = draftFrom(s)
    draft.openTime = "08:00"
    draft.closeTime = "17:00"
    expect(buildSettingsUpdate(s, draft)).toEqual({ clinic_open_time: "08:00", clinic_close_time: null })
  })

  it("drop seconds some browsers add to time inputs", () => {
    const s = settings()
    const draft = draftFrom(s)
    draft.openTime = "07:00:00"
    expect(buildSettingsUpdate(s, draft)).toEqual({})
  })
})
