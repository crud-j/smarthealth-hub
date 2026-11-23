import { describe, expect, it } from "vitest"
import { activeNavHref, visibleNavGroups } from "@/lib/navigation"

// Pins exactly what each role sees in the sidebar. A link must only appear
// for roles the backend require_role(...) guard on that page's API allows.

function layout(role: string | null | undefined): Record<string, string[]> {
  return Object.fromEntries(
    visibleNavGroups(role).map((g) => [g.label, g.items.map((i) => i.label)]),
  )
}

const PATIENT_CARE = ["Patients", "Appointments", "Immunizations", "Health Cards"]
// Profile and Security are one page (/settings/security redirects to it).
const ACCOUNT = ["Profile & Security"]

describe("visibleNavGroups", () => {
  it("admin sees every group, with System Configuration under Administration", () => {
    expect(layout("admin")).toEqual({
      Overview: ["Dashboard"],
      "Patient Care": [...PATIENT_CARE, "Patient Archive", "Inactive Patients"],
      Registrations: ["Registration Inbox", "Registration QR"],
      Insights: ["Analytics", "SMS Logs"],
      Administration: ["Users", "Audit Log", "System Health", "System Configuration"],
      Account: ACCOUNT,
    })
  })

  it("BHW has no Administration group and no archive", () => {
    expect(layout("bhw")).toEqual({
      Overview: ["Dashboard"],
      "Patient Care": PATIENT_CARE,
      Registrations: ["Registration Inbox", "Registration QR"],
      Insights: ["Analytics", "SMS Logs"],
      Account: ACCOUNT,
    })
  })

  it("physician sees the archive but not the Registration QR or SMS Logs", () => {
    expect(layout("physician")).toEqual({
      Overview: ["Dashboard"],
      "Patient Care": [...PATIENT_CARE, "Patient Archive", "Inactive Patients"],
      Registrations: ["Registration Inbox"],
      Insights: ["Analytics"],
      Account: ACCOUNT,
    })
  })

  it("admin staff sees no Insights and no Administration", () => {
    expect(layout("admin_staff")).toEqual({
      Overview: ["Dashboard"],
      "Patient Care": PATIENT_CARE,
      Registrations: ["Registration Inbox", "Registration QR"],
      Account: ACCOUNT,
    })
  })

  it("only admin can see an admin-only /settings page link", () => {
    const adminOnly = ["/settings", "/settings/users", "/settings/audit-log", "/settings/system-health"]
    for (const role of ["bhw", "physician", "admin_staff"]) {
      const hrefs = visibleNavGroups(role).flatMap((g) => g.items.map((i) => i.href))
      for (const href of adminOnly) expect(hrefs).not.toContain(href)
    }
  })

  it("role match is case-insensitive", () => {
    expect(layout("ADMIN")).toEqual(layout("admin"))
  })

  it("an unknown or loading role only sees links open to everyone", () => {
    const expected = {
      Overview: ["Dashboard"],
      "Patient Care": PATIENT_CARE,
      Registrations: ["Registration Inbox"],
      Account: ACCOUNT,
    }
    expect(layout(undefined)).toEqual(expected)
    expect(layout(null)).toEqual(expected)
    expect(layout("someone_else")).toEqual(expected)
  })
})

describe("activeNavHref", () => {
  const hrefs = visibleNavGroups("admin").flatMap((g) => g.items)

  it.each([
    ["/dashboard", "/dashboard"],
    ["/patients", "/patients"],
    ["/patients/123/edit", "/patients"],
    ["/patients/archived", "/patients/archived"],
    ["/patients/inactive", "/patients/inactive"],
    ["/settings", "/settings"],
    ["/settings/users", "/settings/users"],
    ["/settings/profile", "/settings/profile"],
    ["/health-cards/abc/print", "/health-cards"],
  ])("%s highlights only %s", (pathname, expected) => {
    expect(activeNavHref(pathname, hrefs)).toBe(expected)
  })

  it("matches whole path segments, not text prefixes", () => {
    expect(activeNavHref("/patients-old", hrefs)).toBeNull()
  })

  it("the full online-applications list highlights the Registration Inbox", () => {
    expect(activeNavHref("/settings/intake-applications", hrefs)).toBe("/registrations")
  })

  it("returns null for a page that has no sidebar link", () => {
    expect(activeNavHref("/nfc-monitor", hrefs)).toBeNull()
  })
})
