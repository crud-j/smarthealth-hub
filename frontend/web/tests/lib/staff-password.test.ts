import { describe, expect, it } from "vitest"
import { generateTempPassword, passwordProblems } from "@/lib/staff-password"

// Must match backend AdminPasswordReset / ChangePasswordRequest rules:
// 8-128 characters, at least one uppercase letter and one digit.

describe("passwordProblems", () => {
  it("accepts a password that meets every rule", () => {
    expect(passwordProblems("NewTemp123")).toEqual([])
  })

  it.each([
    ["Short1", "At least 8 characters"],
    ["nouppercase1", "One uppercase letter"],
    ["NoDigitsHere", "One number"],
  ])("%s is missing: %s", (pw, problem) => {
    expect(passwordProblems(pw)).toEqual([problem])
  })

  it("lists every missing rule at once", () => {
    expect(passwordProblems("")).toEqual([
      "At least 8 characters",
      "One uppercase letter",
      "One number",
    ])
  })

  it("rejects more than 128 characters", () => {
    expect(passwordProblems(`A1${"x".repeat(127)}`)).toEqual(["At most 128 characters"])
  })
})

describe("generateTempPassword", () => {
  it("always passes the backend rules", () => {
    for (let i = 0; i < 200; i++) {
      expect(passwordProblems(generateTempPassword())).toEqual([])
    }
  })

  it("is 12 characters with no look-alike characters (easy to read aloud)", () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateTempPassword()
      expect(pw).toHaveLength(12)
      expect(pw).not.toMatch(/[0O1lI]/)
    }
  })

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateTempPassword()))
    expect(seen.size).toBe(50)
  })
})
