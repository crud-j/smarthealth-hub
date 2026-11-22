import { describe, expect, it } from "vitest";
import { manilaIso, manilaToday } from "@/lib/manila-time";

// Appointment times are Manila times. Sending them without a timezone let
// the UTC production server save them 8 hours late.

describe("manilaIso", () => {
  it("pins the picked date and time to Manila (+08:00)", () => {
    expect(manilaIso("2026-11-22", "21:00")).toBe("2026-11-22T21:00:00+08:00");
  });

  it("is the same moment wherever the browser is", () => {
    expect(new Date(manilaIso("2026-11-22", "09:00")).toISOString()).toBe("2026-11-22T01:00:00.000Z");
  });

  it("accepts a time that already has seconds", () => {
    expect(manilaIso("2026-11-22", "09:30:00")).toBe("2026-11-22T09:30:00+08:00");
  });
});

describe("manilaToday", () => {
  it("uses the Manila date, not the UTC date", () => {
    // 2026-11-22 20:30 UTC is already Nov 23 in Manila.
    expect(manilaToday(new Date("2026-11-22T20:30:00Z"))).toBe("2026-11-23");
    // 2026-11-22 15:00 UTC is still Nov 22 (11 PM) in Manila.
    expect(manilaToday(new Date("2026-11-22T15:00:00Z"))).toBe("2026-11-22");
  });
});
