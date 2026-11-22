import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewVisitPage from "@/app/(dashboard)/patients/[patientId]/visits/new/page";
import type { VisitPrefill } from "@/types/patient";

// Add Visit with less typing:
// - the visit type and chief complaint start from today's appointment and the
//   intake form the patient filled in for it (staff check and adjust);
// - a BHW records the desk part only (type, complaint, vital signs); the
//   diagnosis and treatment notes are the Physician's.

const createVisit = vi.fn();
const fetchVisitPrefill = vi.fn<(patientId: string) => Promise<VisitPrefill | null>>();

vi.mock("@/hooks/usePatients", () => ({
  usePatient: () => ({
    data: { id: "p-1", patientCode: "BHC-TEST", fullName: "Ana Reyes", allergies: null, isActive: true, archivedAt: null },
    loading: false,
    error: null,
    refetch: () => {},
  }),
  useCreateVisit: () => ({ createVisit, loading: false, error: null }),
  fetchVisitPrefill: (patientId: string) => fetchVisitPrefill(patientId),
}));

let role = "bhw";
vi.mock("@/hooks/useAuth", () => ({
  useCurrentUser: () => ({ user: { role }, isLoading: false, isAuthenticated: true, refetch: () => {} }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const NONE: VisitPrefill = {
  appointmentId: null,
  appointmentType: null,
  scheduledAt: null,
  visitType: null,
  chiefComplaint: null,
  intakeVisitPurpose: null,
};

const PRENATAL_WITH_INTAKE: VisitPrefill = {
  appointmentId: "a-1",
  appointmentType: "prenatal",
  scheduledAt: "2026-11-22T01:00:00Z", // 9:00 AM Manila
  visitType: "prenatal_checkup",
  chiefComplaint: "Prenatal / Maternal Care. Reports: hypertension.",
  intakeVisitPurpose: "Prenatal / Maternal Care",
};

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
  role = "bhw";
  createVisit.mockReset();
  fetchVisitPrefill.mockReset();
  fetchVisitPrefill.mockResolvedValue(NONE);
});

describe("Add Visit prefill", () => {
  it("starts from today's appointment and the patient's intake answers", async () => {
    fetchVisitPrefill.mockResolvedValue(PRENATAL_WITH_INTAKE);
    await renderPage();

    await waitFor(() => expect(screen.getByLabelText(/Visit type/)).toHaveValue("prenatal_checkup"));
    expect(screen.getByLabelText("Chief complaint")).toHaveValue("Prenatal / Maternal Care. Reports: hypertension.");
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("today's Prenatal appointment");
    expect(notice).toHaveTextContent("9:00");
    expect(notice).toHaveTextContent("intake form");
    expect(notice).toHaveTextContent(/Check/);
    expect(fetchVisitPrefill).toHaveBeenCalledWith("p-1");
  });

  it("says only the appointment was used when there is no intake form", async () => {
    fetchVisitPrefill.mockResolvedValue({ ...PRENATAL_WITH_INTAKE, chiefComplaint: null, intakeVisitPurpose: null });
    await renderPage();

    await waitFor(() => expect(screen.getByLabelText(/Visit type/)).toHaveValue("prenatal_checkup"));
    expect(screen.getByLabelText("Chief complaint")).toHaveValue("");
    expect(screen.getByRole("status")).not.toHaveTextContent("intake form");
  });

  it("leaves the form as it was when there is no appointment today", async () => {
    await renderPage();
    await waitFor(() => expect(fetchVisitPrefill).toHaveBeenCalled());
    expect(screen.getByLabelText(/Visit type/)).toHaveValue("consultation");
    expect(screen.getByLabelText("Chief complaint")).toHaveValue("");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not overwrite what staff already typed", async () => {
    let resolve: (value: VisitPrefill) => void = () => {};
    fetchVisitPrefill.mockReturnValue(new Promise((r) => { resolve = r; }));
    await renderPage();

    fireEvent.change(screen.getByLabelText(/Visit type/), { target: { value: "emergency" } });
    fireEvent.change(screen.getByLabelText("Chief complaint"), { target: { value: "Fell from a tricycle" } });
    await act(async () => { resolve(PRENATAL_WITH_INTAKE); });

    expect(screen.getByLabelText(/Visit type/)).toHaveValue("emergency");
    expect(screen.getByLabelText("Chief complaint")).toHaveValue("Fell from a tricycle");
  });
});

describe("BHW desk form", () => {
  it("has no diagnosis or treatment fields and says the Physician adds them", async () => {
    await renderPage();
    expect(screen.queryByLabelText("Diagnosis")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Treatment notes")).not.toBeInTheDocument();
    expect(screen.getByText(/the Physician adds the diagnosis and treatment/i)).toBeInTheDocument();
    // Medical history is still there, folded away.
    expect(screen.getByText("Add past / present medical history (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Past medical history")).toBeInTheDocument();
  });

  it("saves without a diagnosis or treatment notes", async () => {
    createVisit.mockResolvedValue(null);
    await renderPage();
    fireEvent.change(screen.getByLabelText("Chief complaint"), { target: { value: "Headache" } });
    fireEvent.change(screen.getByLabelText("Blood pressure"), { target: { value: "140/90" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Visit" }));
    });

    expect(createVisit).toHaveBeenCalledTimes(1);
    const payload = createVisit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.chiefComplaint).toBe("Headache");
    expect(payload.diagnosis).toBeUndefined();
    expect(payload.treatmentNotes).toBeUndefined();
  });
});

describe("Physician form", () => {
  it("keeps diagnosis and treatment notes", async () => {
    role = "physician";
    await renderPage();
    expect(screen.getByLabelText("Diagnosis")).toBeInTheDocument();
    expect(screen.getByLabelText("Treatment notes")).toBeInTheDocument();
    expect(screen.queryByText(/the Physician adds the diagnosis and treatment/i)).not.toBeInTheDocument();
  });
});

describe("Roles that don't log visits", () => {
  it("never asks for suggestions", async () => {
    role = "admin";
    await renderPage();
    expect(screen.getByText(/Only physicians and BHWs can record visits/)).toBeInTheDocument();
    expect(fetchVisitPrefill).not.toHaveBeenCalled();
  });
});
