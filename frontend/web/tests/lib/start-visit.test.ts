import { describe, expect, it } from "vitest";
import { ARCHIVED_PATIENT_MESSAGE } from "@/lib/patient-status";
import { canStartVisit, manilaDate, startVisitBlockedReason, startVisitHref } from "@/lib/start-visit";

// "Start visit" shows on today's open appointments for the roles that log
// visits. "Today" is the Manila date, whatever the browser's timezone.

const TODAY = "2026-11-22";
const at = (iso: string, status = "confirmed") => ({ status, scheduledAt: iso });

describe("manilaDate", () => {
  it("reads a UTC timestamp as the Manila date", () => {
    // 11:30 PM UTC on the 21st is 7:30 AM on the 22nd in Manila.
    expect(manilaDate("2026-11-21T23:30:00Z")).toBe("2026-11-22");
    expect(manilaDate("2026-11-22T16:30:00Z")).toBe("2026-11-23");
  });
});

describe("canStartVisit", () => {
  it("is for Physicians and BHWs only", () => {
    const appt = at("2026-11-22T02:00:00Z");
    expect(canStartVisit("physician", appt, TODAY)).toBe(true);
    expect(canStartVisit("bhw", appt, TODAY)).toBe(true);
    expect(canStartVisit("admin", appt, TODAY)).toBe(false);
    expect(canStartVisit("admin_staff", appt, TODAY)).toBe(false);
    expect(canStartVisit(undefined, appt, TODAY)).toBe(false);
  });

  it("is for appointments a visit still completes", () => {
    for (const status of ["pending", "confirmed", "missed"]) {
      expect(canStartVisit("bhw", at("2026-11-22T02:00:00Z", status), TODAY)).toBe(true);
    }
    for (const status of ["completed", "cancelled"]) {
      expect(canStartVisit("bhw", at("2026-11-22T02:00:00Z", status), TODAY)).toBe(false);
    }
  });

  it("is for today's Manila date only, including the 7:00 AM opening", () => {
    expect(canStartVisit("bhw", at("2026-11-21T23:00:00Z"), TODAY)).toBe(true); // 7:00 AM today
    expect(canStartVisit("bhw", at("2026-11-22T23:00:00Z"), TODAY)).toBe(false); // 7:00 AM tomorrow
    expect(canStartVisit("bhw", at("2026-11-21T08:00:00Z"), TODAY)).toBe(false); // 4:00 PM yesterday
  });
});

describe("removed patients (deactivated / archived)", () => {
  const archived = { ...at("2026-11-22T02:00:00Z"), patientNotInUseReason: ARCHIVED_PATIENT_MESSAGE };

  it("get no Start visit", () => {
    expect(canStartVisit("bhw", archived, TODAY)).toBe(false);
    expect(canStartVisit("bhw", { ...archived, patientNotInUseReason: null }, TODAY)).toBe(true);
  });

  it("say why, only where Start visit would otherwise show", () => {
    expect(startVisitBlockedReason("bhw", archived, TODAY)).toBe(ARCHIVED_PATIENT_MESSAGE);
    expect(startVisitBlockedReason("admin_staff", archived, TODAY)).toBeNull(); // never had the button
    expect(startVisitBlockedReason("bhw", { ...archived, status: "completed" }, TODAY)).toBeNull();
    expect(startVisitBlockedReason("bhw", at("2026-11-22T02:00:00Z"), TODAY)).toBeNull();
  });
});

describe("startVisitHref", () => {
  it("opens Add Visit for the patient", () => {
    expect(startVisitHref("p1")).toBe("/patients/p1/visits/new");
  });
});
