import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeactivatePatientDialog,
  InactivePatientBanner,
} from "@/app/(dashboard)/patients/_components/PatientDeactivation";
import InactivePatientsPage from "@/app/(dashboard)/patients/inactive/page";
import { useDeactivatePatient, useReactivatePatient } from "@/hooks/usePatients";
import { apiFetch } from "@/lib/api-client";

// Deactivate = switch a patient off for now (hidden from the list and search,
// no SMS). Nothing is deleted and an Admin can switch them back on from the
// Inactive Patients page. Archive (separate) stores old records away.

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
const apiFetchMock = vi.mocked(apiFetch);

let role = "admin";
vi.mock("@/hooks/useAuth", () => ({
  useCurrentUser: () => ({
    user: { role },
    isLoading: false,
    isAuthenticated: true,
    refetch: () => {},
  }),
}));

beforeEach(() => {
  apiFetchMock.mockReset();
  role = "admin";
});

describe("Deactivate dialog", () => {
  it("says nothing is deleted and that it can be undone", () => {
    render(<DeactivatePatientDialog patientName="Ana Reyes" onConfirm={vi.fn()} onCancel={vi.fn()} loading={false} />);
    const dialog = screen.getByRole("dialog", { name: /Deactivate Ana Reyes/ });
    expect(within(dialog).getByText(/Nothing is deleted/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Inactive Patients/)).toBeInTheDocument();
    expect(within(dialog).getByText(/no SMS reminders/i)).toBeInTheDocument();
  });

  it("needs a reason of at least 5 characters", () => {
    const onConfirm = vi.fn();
    render(<DeactivatePatientDialog patientName="Ana Reyes" onConfirm={onConfirm} onCancel={vi.fn()} loading={false} />);
    const button = screen.getByRole("button", { name: "Deactivate patient" });

    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "abc" } });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "  Test record  " } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith("Test record");
  });
});

describe("Inactive banner on the patient page", () => {
  it("shows when, who and why, and a Reactivate button for Admin", () => {
    const onReactivate = vi.fn();
    render(
      <InactivePatientBanner
        deactivatedAt="2026-11-22T03:00:00Z"
        deactivatedByName="Test Admin"
        deactivationReason="Test record"
        canReactivate
        onReactivate={onReactivate}
        reactivating={false}
      />,
    );
    const banner = screen.getByRole("region", { name: /This patient is inactive/ });
    expect(within(banner).getByText(/Nov 22, 2026/)).toBeInTheDocument();
    expect(within(banner).getByText(/Test Admin/)).toBeInTheDocument();
    expect(within(banner).getByText(/Test record/)).toBeInTheDocument();
    expect(within(banner).getByText(/Nothing was deleted/)).toBeInTheDocument();

    fireEvent.click(within(banner).getByRole("button", { name: "Reactivate patient" }));
    expect(onReactivate).toHaveBeenCalledOnce();
  });

  it("has no Reactivate button for other roles, and copes with old records", () => {
    render(
      <InactivePatientBanner
        deactivatedAt={null}
        deactivatedByName={null}
        deactivationReason={null}
        canReactivate={false}
        onReactivate={vi.fn()}
        reactivating={false}
      />,
    );
    const banner = screen.getByRole("region", { name: /This patient is inactive/ });
    expect(within(banner).queryByRole("button")).toBeNull();
    expect(within(banner).queryByText(/since/)).toBeNull();
  });
});

describe("Deactivate / reactivate requests", () => {
  it("deactivate sends the reason to POST /patients/{id}/deactivate", async () => {
    apiFetchMock.mockResolvedValue({} as never);
    const { result } = renderHook(() => useDeactivatePatient());
    let ok = false;
    await act(async () => {
      ok = await result.current.deactivatePatient("p1", "Test record");
    });
    expect(ok).toBe(true);
    expect(apiFetchMock).toHaveBeenCalledWith("/patients/p1/deactivate", {
      method: "POST",
      body: JSON.stringify({ reason: "Test record" }),
    });
  });

  it("reactivate calls POST /patients/{id}/reactivate", async () => {
    apiFetchMock.mockResolvedValue({} as never);
    const { result } = renderHook(() => useReactivatePatient());
    await act(async () => {
      await result.current.reactivatePatient("p1");
    });
    expect(apiFetchMock).toHaveBeenCalledWith("/patients/p1/reactivate", { method: "POST" });
  });
});

describe("Inactive Patients page", () => {
  const row = {
    id: "p1",
    patient_code: "BHC-2026-000001",
    first_name: "Ana",
    middle_name: null,
    last_name: "Reyes",
    full_name: "Ana Reyes",
    birth_date: "1990-01-01",
    age: 36,
    sex: "female",
    mobile_number: null,
    is_senior: false,
    is_pwd: false,
    archived_at: null,
    deactivated_at: "2026-11-22T03:00:00Z",
    deactivated_by_name: "Test Admin",
    deactivation_reason: "Test record",
  };
  const oldRow = {
    ...row,
    id: "p2",
    patient_code: "BHC-2026-000002",
    full_name: "Old Record",
    deactivated_at: null,
    deactivated_by_name: null,
    deactivation_reason: null,
  };

  function serve(items: object[]) {
    apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.startsWith("/patients/inactive")) {
        return { items, total: items.length, page: 1, page_size: 20 } as never;
      }
      if (path.endsWith("/reactivate") && options?.method === "POST") return {} as never;
      throw new Error(`unexpected ${path}`);
    });
  }

  it("lists deactivated patients with when, who and why", async () => {
    serve([row, oldRow]);
    render(<InactivePatientsPage />);

    expect(await screen.findByText("Ana Reyes")).toBeInTheDocument();
    expect(screen.getByText("Test Admin")).toBeInTheDocument();
    expect(screen.getByText("Test record")).toBeInTheDocument();
    expect(screen.getByText("Old Record")).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is deleted/)).toBeInTheDocument();
  });

  it("reactivates after a confirmation", async () => {
    serve([row]);
    render(<InactivePatientsPage />);
    await screen.findByText("Ana Reyes");

    fireEvent.click(screen.getByRole("button", { name: "Reactivate Ana Reyes" }));
    const dialog = screen.getByRole("dialog", { name: /Reactivate Ana Reyes/ });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Yes, reactivate" }));
    });

    expect(apiFetchMock).toHaveBeenCalledWith("/patients/p1/reactivate", { method: "POST" });
    expect(await screen.findByText(/Ana Reyes is active again/)).toBeInTheDocument();
  });

  it("physicians can look but not reactivate", async () => {
    role = "physician";
    serve([row]);
    render(<InactivePatientsPage />);
    await screen.findByText("Ana Reyes");
    expect(screen.queryByRole("button", { name: /Reactivate/ })).toBeNull();
  });

  it("other roles are told they have no access", () => {
    role = "bhw";
    serve([row]);
    render(<InactivePatientsPage />);
    expect(screen.getByText(/Only Admins and Physicians/)).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
