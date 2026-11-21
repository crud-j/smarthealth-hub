import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/(dashboard)/dashboard/page";
import ReminderEffectCard from "@/components/analytics/ReminderEffectCard";
import { apiFetch } from "@/lib/api-client";
import type { AdminDashboardData, BhwDashboardData, ReminderEffect } from "@/types/dashboard";

// Return rate after SMS reminders: finished appointments with vs without a
// reminder SMS, and how many of each the patient came to. Shown on the BHW and
// Admin dashboards (last 30 days) and on Analytics (30 or 90 days).

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
const apiFetchMock = vi.mocked(apiFetch);

vi.mock("@/hooks/useAuth", () => ({
  useCurrentUser: () => ({ user: null, isLoading: false, isAuthenticated: true, refetch: () => {} }),
}));

const TODAY = "2026-11-22";

const effect = (overrides: Partial<ReminderEffect> = {}): ReminderEffect => ({
  from_date: "2026-10-24",
  to_date: TODAY,
  with_reminder: { total: 50, came: 41, came_pct: 82 },
  without_reminder: { total: 20, came: 12, came_pct: 60 },
  difference_points: 22,
  confirmed_by_reply: 9,
  min_group_size: 10,
  ...overrides,
});

function bhw(reminder_effect?: ReminderEffect): BhwDashboardData {
  return {
    role: "bhw", first_name: "Lito", today: TODAY,
    immunizations_due_7d: 0, immunizations_overdue: 0, immunizations_due: [],
    missed_appointments_7d: 0, missed_appointments: [],
    sms_today_sent: 0, sms_today_failed: 0, failed_sms: [],
    appointments_today_count: 0, previsit_forms_waiting: 0,
    visits_logged_by_me_week: 0, patients_without_active_card: 0,
    ...(reminder_effect ? { reminder_effect } : {}),
  };
}

const ok = (message: string) => ({ status: "ok" as const, message });

function admin(reminder_effect?: ReminderEffect): AdminDashboardData {
  return {
    role: "admin", first_name: "Admin", today: TODAY,
    system: {
      overall: "ok", checked_at: "2026-11-22T13:45:00Z",
      version: { commit: "c7ae200", environment: "production" },
      database: ok("Database is reachable."), redis: ok("Redis is reachable."),
      workers: ok("Workers running"), disk: { ...ok("Plenty of space."), used_percent: 26 },
      media: ok("Media folder OK."), backup: { ...ok("Backup OK"), last_success_at: null },
      alerts: ok("Admin alerts configured."),
      reliability: {
        sms: { ...ok("SMS OK."), last_24h: { sent: 3, failed: 0 } },
        sign_in: { ...ok("Sign-ins OK."), last_24h: { successful: 9, failed_password: 0, failed_otp: 0 } },
        reminders: { ...ok(""), runs: [] },
      },
    },
    online_applications_pending: 0, previsit_forms_waiting: 0, recent_applications: [],
    staff: { active: 3, inactive: 0, not_signed_in_30d: 0 }, active_patients: 61, security_alerts: [],
    ...(reminder_effect ? { reminder_effect } : {}),
  };
}

function serveDashboard(data: unknown) {
  apiFetchMock.mockImplementation(async (path: string) => {
    if (path === "/dashboard/me") return data as never;
    throw new Error(`unexpected ${path}`);
  });
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("SMS reminders panel on the dashboards", () => {
  it("shows the BHW how many came with and without a reminder", async () => {
    serveDashboard(bhw(effect()));
    render(<DashboardPage />);

    const panel = await screen.findByRole("region", { name: /SMS reminders/ });
    const withRow = within(panel).getByRole("group", { name: "With reminder" });
    expect(withRow).toHaveTextContent("82%");
    expect(withRow).toHaveTextContent("41 of 50 came");
    const withoutRow = within(panel).getByRole("group", { name: "Without reminder" });
    expect(withoutRow).toHaveTextContent("60%");
    expect(withoutRow).toHaveTextContent("12 of 20 came");
    expect(panel).toHaveTextContent(/22 points higher with a reminder/);
    expect(panel).toHaveTextContent(/9 confirmed by replying CONFIRM/);
    expect(panel).toHaveTextContent(/last 30 days/i);
  });

  it("says when there is not enough data for a percentage", async () => {
    serveDashboard(
      bhw(
        effect({
          with_reminder: { total: 9, came: 8, came_pct: null },
          without_reminder: { total: 3, came: 1, came_pct: null },
          difference_points: null,
          confirmed_by_reply: 0,
        }),
      ),
    );
    render(<DashboardPage />);

    const panel = await screen.findByRole("region", { name: /SMS reminders/ });
    const withRow = within(panel).getByRole("group", { name: "With reminder" });
    expect(withRow).toHaveTextContent("Not enough data yet");
    expect(withRow).toHaveTextContent("8 of 9 came");
    expect(withRow).not.toHaveTextContent("%");
    expect(panel).toHaveTextContent(/at least 10 finished appointments/);
    expect(panel).not.toHaveTextContent(/points/);
    expect(panel).not.toHaveTextContent(/confirmed by replying/);
  });

  it("says when there are no finished appointments yet", async () => {
    serveDashboard(
      bhw(
        effect({
          with_reminder: { total: 0, came: 0, came_pct: null },
          without_reminder: { total: 0, came: 0, came_pct: null },
          difference_points: null,
          confirmed_by_reply: 0,
        }),
      ),
    );
    render(<DashboardPage />);

    const panel = await screen.findByRole("region", { name: /SMS reminders/ });
    expect(panel).toHaveTextContent(/No finished appointments/);
  });

  it("says when reminded patients came less often", async () => {
    serveDashboard(
      bhw(
        effect({
          with_reminder: { total: 10, came: 5, came_pct: 50 },
          without_reminder: { total: 10, came: 7, came_pct: 70 },
          difference_points: -20,
        }),
      ),
    );
    render(<DashboardPage />);

    const panel = await screen.findByRole("region", { name: /SMS reminders/ });
    expect(panel).toHaveTextContent(/20 points lower with a reminder/);
  });

  it("shows it to the admin too (counts only)", async () => {
    serveDashboard(admin(effect()));
    render(<DashboardPage />);

    const panel = await screen.findByRole("region", { name: /SMS reminders/ });
    expect(within(panel).getByRole("group", { name: "With reminder" })).toHaveTextContent("82%");
  });

  it("shows no panel while the server is older and does not send it", async () => {
    serveDashboard(bhw());
    render(<DashboardPage />);

    await screen.findByRole("region", { name: /Immunizations due/ });
    expect(screen.queryByRole("region", { name: /SMS reminders/ })).not.toBeInTheDocument();
  });
});

describe("SMS reminders card on Analytics", () => {
  it("loads the last 30 days and switches to 90", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path.endsWith("days=90")) {
        return effect({ with_reminder: { total: 120, came: 99, came_pct: 82.5 } }) as never;
      }
      return effect() as never;
    });
    await act(async () => {
      render(<ReminderEffectCard />);
    });

    expect(apiFetchMock).toHaveBeenCalledWith("/analytics/appointments/reminder-effect?days=30");
    expect(await screen.findByText("41 of 50 came")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "90 days" }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith("/analytics/appointments/reminder-effect?days=90"),
    );
    expect(await screen.findByText("99 of 120 came")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an error when it cannot load", async () => {
    apiFetchMock.mockRejectedValue(new Error("boom"));
    await act(async () => {
      render(<ReminderEffectCard />);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });
});
