import { describe, expect, it } from "vitest";
import {
  ARCHIVED_PATIENT_MESSAGE,
  INACTIVE_PATIENT_MESSAGE,
  patientNotInUseReason,
} from "@/lib/patient-status";

// Deactivated and archived patients take no new visits, doses or bookings.
// The text matches the backend's 409 message word for word.

describe("patientNotInUseReason", () => {
  it("lets an active, unarchived patient through", () => {
    expect(patientNotInUseReason({ isActive: true, archivedAt: null })).toBeNull();
    expect(patientNotInUseReason({ isActive: true })).toBeNull();
  });

  it("says how to switch an inactive patient back on", () => {
    expect(patientNotInUseReason({ isActive: false, archivedAt: null })).toBe(INACTIVE_PATIENT_MESSAGE);
    expect(INACTIVE_PATIENT_MESSAGE).toMatch(/Inactive Patients/);
  });

  it("says how to restore an archived patient", () => {
    expect(patientNotInUseReason({ isActive: true, archivedAt: "2026-11-01T00:00:00Z" })).toBe(
      ARCHIVED_PATIENT_MESSAGE
    );
    expect(ARCHIVED_PATIENT_MESSAGE).toMatch(/Patient Archive/);
  });

  it("reports inactive first when the patient is both", () => {
    expect(patientNotInUseReason({ isActive: false, archivedAt: "2026-11-01T00:00:00Z" })).toBe(
      INACTIVE_PATIENT_MESSAGE
    );
  });
});
