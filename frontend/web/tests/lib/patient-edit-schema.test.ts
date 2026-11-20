import { describe, expect, it } from "vitest";
import { effectiveAddress, patientUpdateSchema } from "@/lib/schemas/patient";

/**
 * The Edit Patient form used the registration schema, which requires fields
 * the edit page never shows (data privacy consent, emergency contact,
 * barangay...). Validation failed on hidden fields, so "Save Changes" silently
 * did nothing. These values are what the edit form's reset() produces.
 */

// A seeded / older patient: free-text address only, no emergency contact.
const legacyPatient = {
  firstName: "Maria",
  middleName: null,
  lastName: "Dela Cruz",
  birthDate: "1990-05-01",
  sex: "female" as const,
  civilStatus: null,
  mobileNumber: null,
  address: "123 Rizal St., Marilao, Bulacan",
  sitioPurok: null,
  barangay: null,
  municipality: null,
  province: null,
  emergencyContactName: null,
  emergencyContactNumber: null,
  guardianName: null,
  guardianContact: null,
  philhealthNo: null,
  philhealthMemberType: null,
  isPwd: false,
  isPregnant: false,
  bloodType: null,
  allergies: "",
  knownConditions: "",
};

// A patient registered with the current form: structured address + emergency contact.
const registeredPatient = {
  ...legacyPatient,
  address: "Turo, Bocaue, Bulacan",
  sitioPurok: "Purok 2",
  barangay: "Turo",
  municipality: "Bocaue",
  province: "Bulacan",
  emergencyContactName: "Juan Dela Cruz",
  emergencyContactNumber: "09171234567",
  mobileNumber: "+639171234567",
  bloodType: "B+" as const,
  allergies: "Penicillin",
};

describe("patientUpdateSchema (Edit Patient form)", () => {
  it("accepts an older patient with only a free-text address", () => {
    const result = patientUpdateSchema.safeParse(legacyPatient);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("accepts a patient registered with a structured address and emergency contact", () => {
    const result = patientUpdateSchema.safeParse(registeredPatient);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("does not require data privacy consent (it is not on the edit page)", () => {
    const result = patientUpdateSchema.safeParse(registeredPatient);
    expect(result.success).toBe(true);
  });

  it("requires some address: free text or barangay/municipality/province", () => {
    const result = patientUpdateSchema.safeParse({
      ...legacyPatient,
      address: "  ",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toContain("address");
  });

  it("still validates the emergency contact number format when one is entered", () => {
    const result = patientUpdateSchema.safeParse({
      ...registeredPatient,
      emergencyContactNumber: "12345",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toContain("emergencyContactNumber");
  });

  it("still requires first name, last name and sex", () => {
    const result = patientUpdateSchema.safeParse({ ...legacyPatient, firstName: "", lastName: "" });
    expect(result.success).toBe(false);
  });
});

describe("effectiveAddress (mirrors backend patient_service._compose_address)", () => {
  it("uses the structured parts when any is filled", () => {
    expect(
      effectiveAddress({
        address: "123 Rizal St.",
        sitioPurok: "Purok 2",
        barangay: "Turo",
        municipality: "Bocaue",
        province: "Bulacan",
      }),
    ).toBe("Purok 2, Turo, Bocaue, Bulacan");
  });

  it("falls back to the free-text address when no structured part is filled", () => {
    expect(
      effectiveAddress({ address: " 123 Rizal St. ", sitioPurok: " ", barangay: null }),
    ).toBe("123 Rizal St.");
  });

  it("returns an empty string when nothing is filled", () => {
    expect(effectiveAddress({})).toBe("");
  });
});
