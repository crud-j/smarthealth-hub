import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AllergyAlert, PatientAllergyAlert } from "@/components/ui/AllergyAlert";
import { usePatient } from "@/hooks/usePatients";

vi.mock("@/hooks/usePatients", () => ({ usePatient: vi.fn() }));
const usePatientMock = vi.mocked(usePatient);

type HookResult = ReturnType<typeof usePatient>;
function hook(partial: Partial<HookResult>): HookResult {
  return { data: null, loading: false, error: null, refetch: vi.fn(), ...partial } as HookResult;
}

describe("AllergyAlert", () => {
  it("shows the allergies prominently when recorded", () => {
    render(<AllergyAlert status="ready" allergies="Penicillin, Shrimp" />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Allergies");
    expect(alert).toHaveTextContent("Penicillin, Shrimp");
  });

  it.each([null, undefined, "", "   "])(
    "says 'No allergies on record' (never 'no known allergies') when empty: %j",
    (allergies) => {
      render(<AllergyAlert status="ready" allergies={allergies} />);

      expect(screen.getByText(/No allergies on record/)).toBeInTheDocument();
      expect(screen.queryByText(/no known allergies/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("shows nothing reassuring while loading", () => {
    const { container } = render(<AllergyAlert status="loading" />);

    expect(container).not.toHaveTextContent(/No allergies/i);
  });

  it("warns when allergies could not be loaded", () => {
    render(<AllergyAlert status="error" />);

    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/No allergies on record/)).not.toBeInTheDocument();
  });

  it("links to the edit page when an edit link is given", () => {
    render(<AllergyAlert status="ready" allergies={null} editHref="/patients/p1/edit" />);

    expect(screen.getByRole("link", { name: /record allergies|edit/i })).toHaveAttribute(
      "href",
      "/patients/p1/edit",
    );
  });
});

describe("PatientAllergyAlert (loads the patient by id)", () => {
  beforeEach(() => usePatientMock.mockReset());

  it("shows the loaded patient's allergies", () => {
    usePatientMock.mockReturnValue(hook({ data: { id: "p1", allergies: "Egg" } as HookResult["data"] }));

    render(<PatientAllergyAlert patientId="p1" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Egg");
  });

  it("before the first fetch (no data, not loading) does not claim 'No allergies'", () => {
    usePatientMock.mockReturnValue(hook({}));

    const { container } = render(<PatientAllergyAlert patientId="p1" />);

    expect(container).not.toHaveTextContent(/No allergies/i);
  });

  it("never shows another patient's allergies while switching patients", () => {
    // Hook still holds patient A's data while patient B is being fetched.
    usePatientMock.mockReturnValue(
      hook({ data: { id: "patient-A", allergies: "Penicillin" } as HookResult["data"], loading: true }),
    );

    const { container } = render(<PatientAllergyAlert patientId="patient-B" />);

    expect(container).not.toHaveTextContent("Penicillin");
    expect(container).not.toHaveTextContent(/No allergies/i);
  });

  it("shows the error warning when the patient could not be loaded", () => {
    usePatientMock.mockReturnValue(hook({ error: new Error("403") as HookResult["error"] }));

    render(<PatientAllergyAlert patientId="p1" />);

    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });
});
