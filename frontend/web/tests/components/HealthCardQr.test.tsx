import { act, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HealthCardPreview from "@/components/cards/HealthCardPreview";
import HealthCardPrintPage from "@/app/(dashboard)/health-cards/[patientId]/print/page";
import { apiFetch } from "@/lib/api-client";
import { generateQrDataUri } from "@/lib/qr";
import type { HealthCardData } from "@/types/healthCard";
import type { Patient } from "@/types/patient";

// The card QR must be the server's HMAC-signed QR (the same one the PDF
// prints). The preview used to draw its own from a hard-coded development
// address without a signature, so cards printed from the screen opened
// "This site can't be reached" and could never verify.

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock("@/lib/qr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/qr")>();
  return { ...actual, generateQrDataUri: vi.fn().mockResolvedValue("data:image/png;base64,UNSIGNED") };
});
const apiFetchMock = vi.mocked(apiFetch);

const SIGNED_QR = "data:image/png;base64,SIGNED";

const baseCard: HealthCardData = {
  id: "card-1",
  patient_id: "p-1",
  card_number: "BHC-2026-000001",
  card_version: 1,
  status: "active",
  issued_at: "2026-11-20T00:00:00Z",
  expires_at: null,
  nfc_uid: null,
  qr_data_uri: null,
};

const patient = {
  id: "p-1",
  patientCode: "BHC-TEST",
  firstName: "Test",
  middleName: null,
  lastName: "Patient",
  sex: "female",
  birthDate: "1990-01-01",
  age: 36,
  address: "Patubig, Marilao, Bulacan",
  barangay: "Patubig",
  municipality: "Marilao",
  province: "Bulacan",
  isSenior: false,
  isPwd: false,
  isPregnant: false,
} as Patient;

beforeEach(() => {
  apiFetchMock.mockReset();
  vi.mocked(generateQrDataUri).mockClear();
});

describe("HealthCardPreview QR", () => {
  it("shows the server's signed QR", () => {
    render(<HealthCardPreview patient={patient} card={{ ...baseCard, qr_data_uri: SIGNED_QR }} />);

    expect(screen.getByRole("img", { name: "QR" })).toHaveAttribute("src", SIGNED_QR);
  });

  it("never draws its own unsigned QR when the server sent none", async () => {
    render(<HealthCardPreview patient={patient} card={baseCard} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(generateQrDataUri).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: "QR" })).not.toBeInTheDocument();
    expect(screen.getByText("QR on PDF")).toBeInTheDocument();
  });
});

describe("Health card Print page", () => {
  it("asks the server for the signed QR when it loads an existing card", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/patients/")) {
        return {
          id: "p-1",
          patient_code: "BHC-TEST",
          first_name: "Test",
          middle_name: null,
          last_name: "Patient",
          sex: "female",
          birth_date: "1990-01-01",
          age: 36,
          address: "Patubig, Marilao, Bulacan",
        } as never;
      }
      return { ...baseCard, qr_data_uri: SIGNED_QR } as never;
    });

    await act(async () => {
      render(
        <Suspense fallback={null}>
          <HealthCardPrintPage params={Promise.resolve({ patientId: "p-1" })} />
        </Suspense>
      );
    });

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/health-cards/p-1?include_qr=true")
    );
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "QR" })).toHaveAttribute("src", SIGNED_QR)
    );
  });
});
