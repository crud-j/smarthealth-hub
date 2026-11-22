import { Suspense } from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewVisitPage from "@/app/(dashboard)/patients/[patientId]/visits/new/page";

// A deactivated or archived patient takes no new visits. Opening
// /patients/{id}/visits/new directly shows why instead of the form; the API
// refuses too (409), this just saves staff from filling in a form for nothing.

let patient: Record<string, unknown> = {};
const createVisit = vi.fn();

vi.mock("@/hooks/usePatients", () => ({
  usePatient: () => ({ data: patient, loading: false, error: null, refetch: () => {} }),
  useCreateVisit: () => ({ createVisit, loading: false, error: null }),
  fetchVisitPrefill: async () => null,
}));

vi.mock("@/hooks/useAuth", () => ({
  useCurrentUser: () => ({
    user: { role: "bhw" },
    isLoading: false,
    isAuthenticated: true,
    refetch: () => {},
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

function makePatient(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "p-1",
    patientCode: "BHC-TEST",
    fullName: "Resa Test",
    allergies: null,
    isActive: true,
    archivedAt: null,
    ...overrides,
  };
}

async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <NewVisitPage params={Promise.resolve({ patientId: "p-1" })} />
      </Suspense>
    );
  });
}

beforeEach(() => {
  createVisit.mockReset();
});

describe("New visit page", () => {
  it("shows the form for an active patient", async () => {
    patient = makePatient({});
    await renderPage();
    expect(await screen.findByRole("button", { name: "Save Visit" })).toBeInTheDocument();
    expect(screen.queryByText(/No new visits/)).not.toBeInTheDocument();
  });

  it("blocks an inactive patient and says how to switch them back on", async () => {
    patient = makePatient({ isActive: false });
    await renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No new visits for Resa Test");
    expect(alert).toHaveTextContent("Reactivate them on the Inactive Patients page first.");
    expect(alert).toHaveTextContent(/earlier visits are still on the patient record/);
    expect(screen.queryByRole("button", { name: "Save Visit" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to patient profile" })).toHaveAttribute("href", "/patients/p-1");
  });

  it("blocks an archived patient and points to the Patient Archive", async () => {
    patient = makePatient({ archivedAt: "2026-11-01T00:00:00Z" });
    await renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Restore them from the Patient Archive first.");
    expect(screen.queryByRole("button", { name: "Save Visit" })).not.toBeInTheDocument();
    expect(createVisit).not.toHaveBeenCalled();
  });
});
