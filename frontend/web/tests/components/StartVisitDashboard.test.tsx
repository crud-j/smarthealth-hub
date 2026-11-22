import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/(dashboard)/dashboard/page";
import { apiFetch } from "@/lib/api-client";
import type { AppointmentRow, BhwDashboardData, PhysicianDashboardData } from "@/types/dashboard";

// Today's appointments on the Physician and BHW dashboards have "Start
// visit", which opens Add Visit already filled in from the appointment.

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
const apiFetchMock = vi.mocked(apiFetch);

vi.mock("@/hooks/useAuth", () => ({
  useCurrentUser: () => ({ user: null, isLoading: false, isAuthenticated: true, refetch: () => {} }),
}));

const TODAY = "2026-11-22";
const ref = (id: string, full_name: string) => ({ id, patient_code: `BHC-${id}`, full_name });

const todays: AppointmentRow[] = [
  // 7:30 AM Manila (11:30 PM UTC the day before)
  { id: "a1", patient: ref("p1", "Early Mother"), appointment_type: "prenatal", scheduled_at: "2026-11-21T23:30:00Z", status: "confirmed", intake_completed: true },
  { id: "a2", patient: ref("p2", "Seen Already"), appointment_type: "checkup", scheduled_at: "2026-11-22T01:00:00Z", status: "completed", intake_completed: false },
  { id: "a3", patient: ref("p3", "Late Child"), appointment_type: "vaccination", scheduled_at: "2026-11-22T06:00:00Z", status: "missed", intake_completed: false },
];

const physician: PhysicianDashboardData = {
  role: "physician", first_name: "Rosa", today: TODAY,
  waiting_count: 0, waiting: [], consultations_today: 0, consultations_week: 0,
  follow_ups_due_7d: 0, appointments_today_count: 3, appointments_today: todays,
  top_conditions_month: [],
};

const bhw: BhwDashboardData = {
  role: "bhw", first_name: "Lito", today: TODAY,
  immunizations_due_7d: 0, immunizations_overdue: 0, immunizations_due: [],
  missed_appointments_7d: 0, missed_appointments: [],
  sms_today_sent: 0, sms_today_failed: 0, failed_sms: [],
  appointments_today_count: 3, appointments_today: todays,
  previsit_forms_waiting: 0, visits_logged_by_me_week: 0, patients_without_active_card: 0,
};

function serve(dashboard: unknown) {
  apiFetchMock.mockImplementation(async (path: string) => {
    if (path === "/dashboard/me") return dashboard as never;
    return { items: [], total: 0, page: 1, page_size: 5 } as never;
  });
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

function rowFor(panel: HTMLElement, name: string): HTMLElement {
  const row = within(panel).getByText(name).closest("li");
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe.each([
  ["Physician", physician],
  ["BHW", bhw],
])("%s dashboard, today's appointments", (_label, data) => {
  it("has Start visit on open appointments, linking to Add Visit", async () => {
    serve(data);
    render(<DashboardPage />);

    const panel = await screen.findByRole("region", { name: /Today's appointments/ });
    expect(within(rowFor(panel, "Early Mother")).getByRole("link", { name: "Start visit for Early Mother" })).toHaveAttribute(
      "href",
      "/patients/p1/visits/new",
    );
    expect(within(rowFor(panel, "Late Child")).getByRole("link", { name: "Start visit for Late Child" })).toHaveAttribute(
      "href",
      "/patients/p3/visits/new",
    );
    // Already completed by a visit: no second visit from here.
    expect(within(rowFor(panel, "Seen Already")).queryByRole("link", { name: /Start visit/ })).not.toBeInTheDocument();
    // The row itself still opens the appointment.
    expect(within(rowFor(panel, "Seen Already")).getByRole("link", { name: /Seen Already/ })).toHaveAttribute(
      "href",
      "/appointments/a2",
    );
  });
});

describe("BHW dashboard on an older backend", () => {
  it("shows no today's list when the server does not send one", async () => {
    const { appointments_today: _omit, ...older } = bhw;
    serve(older);
    render(<DashboardPage />);

    expect(await screen.findByText(/Lito/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Today's appointments/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Start visit/ })).not.toBeInTheDocument();
  });
});
