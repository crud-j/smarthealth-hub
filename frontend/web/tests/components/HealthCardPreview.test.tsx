import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HealthCardPreview from "@/components/cards/HealthCardPreview";
import type { HealthCardData } from "@/types/healthCard";
import type { Patient } from "@/types/patient";

// The on-screen card back must print the same address as the PDF card back
// (backend patient_service.patient_address): house/street first.

const card: HealthCardData = {
  id: "card-1",
  patient_id: "p-1",
  card_number: "C-1",
  card_version: 1,
  status: "active",
  issued_at: "2026-11-20T00:00:00Z",
  expires_at: null,
  nfc_uid: null,
  qr_data_uri: "data:image/png;base64,AAAA", // skip QR generation
};

const basePatient = {
  id: "p-1",
  patientCode: "BHC-TEST",
  firstName: "Test",
  middleName: null,
  lastName: "Patient",
  sex: "female",
  birthDate: "1990-01-01",
  age: 36,
  address: "Patubig, Marilao, Bulacan",
  sitioPurok: null,
  barangay: "Patubig",
  municipality: "Marilao",
  province: "Bulacan",
  isSenior: false,
  isPwd: false,
  isPregnant: false,
} as Patient;

function renderBack(patient: Patient) {
  render(<HealthCardPreview patient={patient} card={card} />);
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
}

describe("HealthCardPreview address", () => {
  it("prints the house/street before barangay, municipality and province", () => {
    renderBack({ ...basePatient, houseStreet: "123 Rosal St., near the chapel" });

    expect(screen.getByText("123 Rosal St., near the chapel, Patubig, Marilao, Bulacan")).toBeInTheDocument();
  });

  it("prints the free-text address for an older patient with no structured parts", () => {
    renderBack({
      ...basePatient,
      address: "123 Test Street, Manila",
      barangay: null,
      municipality: null,
      province: null,
    });

    expect(screen.getByText("123 Test Street, Manila")).toBeInTheDocument();
  });
});
