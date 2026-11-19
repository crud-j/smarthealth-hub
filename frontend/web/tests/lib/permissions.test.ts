import { describe, expect, it } from "vitest"
import { canAccessClinicalPhi, canDeleteImmunization, canLogVisit } from "@/lib/permissions"

// Admin role model B: these must match the backend require_role(...) guards.
const ROLES = ["admin", "bhw", "physician", "admin_staff"] as const

describe("permissions (admin role model B)", () => {
  it("only the physician reads or edits clinical PHI", () => {
    const allowed = ROLES.filter((r) => canAccessClinicalPhi(r))
    expect(allowed).toEqual(["physician"])
  })

  it("physician and BHW may log a visit, admin and admin staff may not", () => {
    const allowed = ROLES.filter((r) => canLogVisit(r))
    expect(allowed).toEqual(["bhw", "physician"])
  })

  it("only the physician deletes immunization records", () => {
    const allowed = ROLES.filter((r) => canDeleteImmunization(r))
    expect(allowed).toEqual(["physician"])
  })

  it("denies everything while the user is still loading", () => {
    for (const fn of [canAccessClinicalPhi, canLogVisit, canDeleteImmunization]) {
      expect(fn(undefined)).toBe(false)
      expect(fn(null)).toBe(false)
    }
  })
})
