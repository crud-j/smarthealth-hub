import { describe, expect, it } from "vitest";
import { DEFAULT_CLINIC_HOURS, formatClock, outsideClinicHours } from "@/lib/clinic-hours";

// Appointments only during clinic hours (Manila time, close not included).
// A 12:00 AM booking meant for noon slipped through before.

describe("formatClock", () => {
  it("writes 24-hour times the way staff read them", () => {
    expect(formatClock("07:00")).toBe("7:00 AM");
    expect(formatClock("12:00")).toBe("12:00 PM");
    expect(formatClock("00:00")).toBe("12:00 AM");
    expect(formatClock("17:30")).toBe("5:30 PM");
  });
});

describe("outsideClinicHours", () => {
  const hours = DEFAULT_CLINIC_HOURS; // 07:00 - 17:00

  it("accepts opening time up to just before closing", () => {
    expect(outsideClinicHours("07:00", hours)).toBeNull();
    expect(outsideClinicHours("12:00", hours)).toBeNull();
    expect(outsideClinicHours("16:59", hours)).toBeNull();
  });

  it("refuses midnight, early morning, closing time and evening, naming the hours", () => {
    for (const time of ["00:00", "06:59", "17:00", "21:00"]) {
      const problem = outsideClinicHours(time, hours);
      expect(problem).toMatch(/7:00 AM to 5:00 PM/);
      expect(problem).toMatch(/AM \/ PM/);
    }
  });

  it("uses the hours the Admin set", () => {
    const morning = { openTime: "08:00", closeTime: "12:00" };
    expect(outsideClinicHours("11:30", morning)).toBeNull();
    expect(outsideClinicHours("13:00", morning)).toMatch(/8:00 AM to 12:00 PM/);
  });

  it("says nothing about a time that is not filled in yet", () => {
    expect(outsideClinicHours("", hours)).toBeNull();
  });
});
