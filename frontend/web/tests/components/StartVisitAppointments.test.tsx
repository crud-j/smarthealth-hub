import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppointmentsPage from "@/app/(dashboard)/appointments/page";
import AppointmentDetailPage from "@/app/(dashboard)/appointments/[appointmentId]/page";
import { ARCHIVED_PATIENT_MESSAGE, INACTIVE_PATIENT_MESSAGE } from "@/lib/patient-status";
import type { Appointment, AppointmentListParams } from "@/types/appointment";

// "Start visit" on the Appointments page and the appointment page opens Add
// Visit (already filled in from today's appointment). Only for today's open
// appointments and for the roles that log visits. "Today" lists today's
// appointments in one click.

const NOW = new Date("2026-11-22T04:00:00Z"); // 12:00 PM Manila, Nov 22

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: "a1",
    patientId: "p1",
    patientName: "Ana Reyes",
    patientCode: "BHC-T-1",
    appointmentType: "prenatal",
    scheduledAt: "2026-11-22T01:00:00Z", // 9:00 AM Manila today
    status: "confirmed",
    createdAt: "2026-11-20T01:00:00Z",
    intakeCompleted: false,
    intakeSubmittedAt: null,
    ...overrides,
  };
}

let role = "bhw";
let listItems: Appointment[] = [];
let detail: Appointment | null = null;
const listParams = vi.fn<(p: AppointmentListParams) => void>();

vi.mock("@/hooks/useAuth", () => ({
  useCurrentUser: () => ({ user: { id: "u1", full_name: "Test User", role }, isLoading: false, isAuthenticated: true, refetch: () => {} }),
}));

vi.mock("@/hooks/useAppointments", () => ({
  useAppointmentList: (p: AppointmentListParams) => {
    listParams(p);
    return { data: { items: listItems, total: listItems.length, page: 1, pageSize: 15 }, loading: false, error: null, refetch: () => {} };
  },
  useCancelAppointment: () => ({ cancelAppointment: vi.fn(), loading: false, error: null }),
  useAppointment: () => ({ data: detail, loading: false, error: null, refetch: () => {} }),
  useUpdateAppointment: () => ({ updateAppointment: vi.fn(), loading: false, error: null }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  role = "bhw";
  listItems = [];
  detail = null;
  listParams.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest("tr");
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe("Appointments page", () => {
  it("offers Start visit on today's open appointments only", () => {
    listItems = [
      appointment({ id: "a1", patientId: "p1", patientName: "Today Confirmed" }),
      appointment({ id: "a2", patientId: "p2", patientName: "Today Missed", status: "missed" }),
      appointment({ id: "a3", patientId: "p3", patientName: "Today Done", status: "completed" }),
      appointment({ id: "a4", patientId: "p4", patientName: "Tomorrow Morning", scheduledAt: "2026-11-22T23:30:00Z" }),
      appointment({ id: "a5", patientId: "p5", patientName: "Opening Today", scheduledAt: "2026-11-21T23:00:00Z" }),
    ];
    render(<AppointmentsPage />);

    expect(within(rowFor("Today Confirmed")).getByRole("link", { name: /Start visit/ })).toHaveAttribute(
      "href",
      "/patients/p1/visits/new",
    );
    expect(within(rowFor("Today Missed")).getByRole("link", { name: /Start visit/ })).toHaveAttribute(
      "href",
      "/patients/p2/visits/new",
    );
    // 7:00 AM Manila is 11:00 PM UTC the day before: still today.
    expect(within(rowFor("Opening Today")).getByRole("link", { name: /Start visit/ })).toBeInTheDocument();
    expect(within(rowFor("Today Done")).queryByRole("link", { name: /Start visit/ })).not.toBeInTheDocument();
    expect(within(rowFor("Tomorrow Morning")).queryByRole("link", { name: /Start visit/ })).not.toBeInTheDocument();
  });

  it("says the patient is archived or inactive instead of offering Start visit", () => {
    listItems = [
      appointment({ id: "a1", patientId: "p1", patientName: "Stored Away", patientNotInUseReason: ARCHIVED_PATIENT_MESSAGE }),
      appointment({ id: "a2", patientId: "p2", patientName: "Switched Off", patientNotInUseReason: INACTIVE_PATIENT_MESSAGE }),
    ];
    render(<AppointmentsPage />);

    const stored = rowFor("Stored Away");
    expect(within(stored).queryByRole("link", { name: /Start visit/ })).not.toBeInTheDocument();
    expect(within(stored).getByText("Patient archived")).toHaveAttribute("title", ARCHIVED_PATIENT_MESSAGE);
    const off = rowFor("Switched Off");
    expect(within(off).queryByRole("link", { name: /Start visit/ })).not.toBeInTheDocument();
    expect(within(off).getByText("Patient inactive")).toHaveAttribute("title", INACTIVE_PATIENT_MESSAGE);
  });

  it("does not offer Start visit to roles that cannot log visits", () => {
    role = "admin_staff";
    listItems = [appointment({ patientName: "Today Confirmed" })];
    render(<AppointmentsPage />);
    expect(screen.getByText("Today Confirmed")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Start visit/ })).not.toBeInTheDocument();
  });

  it("lists today's appointments (Manila date) with one click", () => {
    render(<AppointmentsPage />);
    const today = screen.getByRole("button", { name: "Today" });
    expect(today).toHaveAttribute("aria-pressed", "false");

    act(() => {
      fireEvent.click(today);
    });

    expect(listParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ fromDate: "2026-11-22", toDate: "2026-11-22", page: 1 }),
    );
    expect(screen.getByLabelText("From date")).toHaveValue("2026-11-22");
    expect(screen.getByLabelText("To date")).toHaveValue("2026-11-22");
    expect(today).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Appointment page", () => {
  async function renderDetail() {
    await act(async () => {
      render(<AppointmentDetailPage params={Promise.resolve({ appointmentId: "a1" })} />);
    });
  }

  it("has Start visit for today's appointment", async () => {
    role = "physician";
    detail = appointment({});
    await renderDetail();
    expect(await screen.findByRole("link", { name: "Start visit" })).toHaveAttribute("href", "/patients/p1/visits/new");
    expect(screen.getByText(/Saving the visit marks the appointment completed/)).toBeInTheDocument();
  });

  it("explains why an archived patient's appointment has no Start visit", async () => {
    role = "physician";
    detail = appointment({ patientNotInUseReason: ARCHIVED_PATIENT_MESSAGE });
    await renderDetail();
    expect(await screen.findByText("No new visits for this patient")).toBeInTheDocument();
    expect(screen.getByText(ARCHIVED_PATIENT_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start visit" })).not.toBeInTheDocument();
  });

  it("has no Start visit for another day, a completed visit, or the front desk", async () => {
    for (const [r, appt] of [
      ["bhw", appointment({ scheduledAt: "2026-11-25T01:00:00Z" })],
      ["bhw", appointment({ status: "completed" })],
      ["admin_staff", appointment({})],
      ["admin", appointment({})],
    ] as const) {
      role = r;
      detail = appt;
      let unmount = () => {};
      await act(async () => {
        ({ unmount } = render(<AppointmentDetailPage params={Promise.resolve({ appointmentId: "a1" })} />));
      });
      // The page rendered (not still loading), and has no Start visit.
      expect(await screen.findByRole("heading", { level: 1, name: "Ana Reyes" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Start visit" })).not.toBeInTheDocument();
      unmount();
    }
  });
});
