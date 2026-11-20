import { describe, expect, it } from "vitest"
import { previewSms, smsParts, templateProblems } from "@/lib/sms-template"

// Mirrors backend app/services/sms_templates.py template_problems (the backend
// check is authoritative; this gives instant feedback while typing).

const APPT = {
  placeholders: ["patient_name", "appointment_type", "scheduled_date", "scheduled_time", "bhc_name"],
  required: ["scheduled_date", "scheduled_time"],
  maxLength: 480,
}
const MISSED = { placeholders: ["first_name", "bhc_name"], required: [], maxLength: 480 }

describe("templateProblems", () => {
  it("accepts allowed placeholders and literal {{ }}", () => {
    expect(templateProblems("Hi {patient_name} {scheduled_date} {scheduled_time} {{x}}", APPT)).toEqual([])
  })

  it.each([
    ["Hi {secret} {scheduled_date} {scheduled_time}", "Unknown placeholder {secret}"],
    ["{patient_name.__class__} {scheduled_date} {scheduled_time}", "Unknown placeholder {patient_name.__class__}"],
    ["{patient_name[0]} {scheduled_date} {scheduled_time}", "Unknown placeholder {patient_name[0]}"],
    ["{} {scheduled_date} {scheduled_time}", "Unknown placeholder {}"],
    ["{patient_name!r} {scheduled_date} {scheduled_time}", "{patient_name} cannot have formatting"],
    ["{patient_name:>9} {scheduled_date} {scheduled_time}", "{patient_name} cannot have formatting"],
    ["Hi {patient_name {scheduled_date} {scheduled_time}", "Unmatched { or }"],
    ["Hi } {scheduled_date} {scheduled_time}", "Unmatched { or }"],
  ])("%s → %s", (text, problem) => {
    expect(templateProblems(text, APPT).join(" | ")).toContain(problem)
  })

  it("lists the allowed placeholders with an unknown one", () => {
    expect(templateProblems("Hi {vaccine_name}", MISSED)).toEqual([
      "Unknown placeholder {vaccine_name}. Use: {first_name}, {bhc_name}",
    ])
  })

  it("requires the essential placeholders", () => {
    expect(templateProblems("Hi {patient_name}", APPT)).toEqual([
      "Must include {scheduled_date}",
      "Must include {scheduled_time}",
    ])
  })

  it("rejects empty and too long", () => {
    expect(templateProblems("   ", MISSED)).toEqual(["Cannot be empty"])
    expect(templateProblems("x".repeat(481), MISSED)).toEqual(["At most 480 characters"])
  })
})

describe("previewSms", () => {
  const values = { first_name: "Juan", bhc_name: "BHC Uno", patient_name: "Juan Dela Cruz",
    appointment_type: "consultation", scheduled_date: "12/01/2026", scheduled_time: "09:00 AM" }

  it("fills placeholders and unescapes braces", () => {
    expect(previewSms("Hi {first_name}, call {bhc_name} {{now}}", values, null)).toBe(
      "Hi Juan, call BHC Uno {now}",
    )
  })

  it("adds the CONFIRM code like the scheduler, cutting at the send limit", () => {
    expect(previewSms("See you {scheduled_date}", values, 135)).toBe(
      "See you 12/01/2026 CONFIRM 1234 to confirm.",
    )
    const long = previewSms("A".repeat(200), values, 135)
    expect(long).toBe(`${"A".repeat(132)}... CONFIRM 1234 to confirm.`)
    expect(long).toHaveLength(160)
  })
})

describe("smsParts", () => {
  it.each([
    [0, 1],
    [160, 1],
    [161, 2],
    [306, 2],
    [307, 3],
  ])("%i characters → %i SMS", (length, parts) => {
    expect(smsParts(length)).toBe(parts)
  })
})
