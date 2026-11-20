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

describe("patientUpdateSchema house/street", () => {
  it("accepts a house/street up to 255 characters", () => {
    const result = patientUpdateSchema.safeParse({ ...registeredPatient, houseStreet: "x".repeat(255) });
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("rejects a house/street over 255 characters (the column size)", () => {
    const result = patientUpdateSchema.safeParse({ ...registeredPatient, houseStreet: "x".repeat(256) });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toContain("houseStreet");
  });
});

// Same cases as backend tests/test_patient_address.py (compose_address).
describe("effectiveAddress (mirrors backend patient_service.compose_address)", () => {
  it("puts the house/street first, before the structured parts", () => {
    expect(
      effectiveAddress({
        address: "ignored free text",
        houseStreet: "Blk 4 Lot 2 Rosal St., near the chapel",
        sitioPurok: "Purok 3",
        barangay: "Patubig",
        municipality: "Marilao",
        province: "Bulacan",
      }),
    ).toBe("Blk 4 Lot 2 Rosal St., near the chapel, Purok 3, Patubig, Marilao, Bulacan");
  });

  it("skips blank parts and trims each part", () => {
    expect(
      effectiveAddress({
        houseStreet: "  123 Rizal St.  ",
        sitioPurok: " ",
        barangay: "Turo",
        municipality: "",
        province: " Bulacan ",
      }),
    ).toBe("123 Rizal St., Turo, Bulacan");
  });

  it("keeps the free-text address when no location part is filled, even with a house/street", () => {
    expect(effectiveAddress({ address: " 123 Rizal St., Marilao ", houseStreet: "Lot 5" })).toBe(
      "123 Rizal St., Marilao",
    );
  });

  it("falls back to the house/street when nothing else is filled", () => {
    expect(effectiveAddress({ houseStreet: " Lot 5 " })).toBe("Lot 5");
  });

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
