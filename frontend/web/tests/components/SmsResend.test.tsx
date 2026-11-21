import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/(dashboard)/dashboard/page";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { BhwDashboardData, FailedSmsRow } from "@/types/dashboard";

// BHW dashboard → "Failed reminder SMS": a Resend button queues a new copy
// to the patient's current number (POST /sms/logs/{id}/resend). The server
// says per row whether it can be resent and whether it already was.

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
const apiFetchMock = vi.mocked(apiFetch);

vi.mock("@/hooks/useAuth", () => ({
  useCurrentUser: () => ({ user: null, isLoading: false, isAuthenticated: true, refetch: () => {} }),
}));

const row = (id: string, name: string, extra: Partial<FailedSmsRow> = {}): FailedSmsRow => ({
  id,
  patient: { id: `p-${id}`, patient_code: `BHC-${id}`, full_name: name },
  kind: "appointment",
  created_at: "2026-11-22T02:00:00Z",
  reason: "Invalid number",
  ...extra,
});

function bhw(failed_sms: FailedSmsRow[]): BhwDashboardData {
  return {
    role: "bhw", first_name: "Lito", today: "2026-11-22",
    immunizations_due_7d: 0, immunizations_overdue: 0, immunizations_due: [],
    missed_appointments_7d: 0, missed_appointments: [],
    sms_today_sent: 0, sms_today_failed: failed_sms.length, failed_sms,
    appointments_today_count: 0, previsit_forms_waiting: 0,
    visits_logged_by_me_week: 0, patients_without_active_card: 0,
  };
}

function serve(data: BhwDashboardData, resend: (path: string) => Promise<unknown>) {
  apiFetchMock.mockImplementation(async (path: string, options?: RequestInit) => {
    if (path === "/dashboard/me") return data as never;
    if (path.endsWith("/resend") && options?.method === "POST") return (await resend(path)) as never;
    throw new Error(`unexpected ${path}`);
  });
}

async function failedPanel() {
  return screen.findByRole("region", { name: /Failed reminder SMS/ });
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("Resend failed SMS", () => {
  it("queues a resend and says so", async () => {
    serve(bhw([row("s1", "Wrong Number", { can_resend: true, resent: false })]), async () => ({
      sms_log_id: "new-1",
      status: "queued",
    }));
    render(<DashboardPage />);

    const panel = await failedPanel();
    const button = within(panel).getByRole("button", { name: "Resend SMS to Wrong Number" });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(apiFetchMock).toHaveBeenCalledWith("/sms/logs/s1/resend", { method: "POST" });
    expect(within(panel).getByText("Resend queued")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /Resend SMS/ })).not.toBeInTheDocument();
  });

  it("shows the server's reason when it refuses", async () => {
    serve(bhw([row("s1", "Wrong Number", { can_resend: true })]), async () => {
      throw new ApiError("The patient has no mobile number. Add one on the patient record first.", 409, "conflict");
    });
    render(<DashboardPage />);

    const panel = await failedPanel();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Resend SMS to Wrong Number" }));
    });

    expect(within(panel).getByRole("alert")).toHaveTextContent(/no mobile number/);
    expect(within(panel).getByRole("button", { name: "Resend SMS to Wrong Number" })).toBeEnabled();
  });

  it("shows 'Resent' for rows already resent and no button when it cannot be resent", async () => {
    serve(
      bhw([
        row("s1", "Already Done", { can_resend: false, resent: true }),
        row("s2", "Past Appointment", { can_resend: false, resent: false }),
      ]),
      async () => ({}),
    );
    render(<DashboardPage />);

    const panel = await failedPanel();
    expect(within(panel).getByText("Resent")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /Resend SMS/ })).not.toBeInTheDocument();
    // "Fix number" stays available.
    expect(within(panel).getAllByRole("link", { name: "Fix number" })).toHaveLength(2);
  });

  it("shows no button while the server is older and does not say", async () => {
    serve(bhw([row("s1", "Wrong Number")]), async () => ({}));
    render(<DashboardPage />);

    const panel = await failedPanel();
    expect(within(panel).queryByRole("button", { name: /Resend SMS/ })).not.toBeInTheDocument();
  });
});
