import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SystemHealthPage from "@/app/(dashboard)/settings/system-health/page";
import { apiFetch } from "@/lib/api-client";

// System Health in plain words: one answer at the top, then anything that
// needs attention (with the server's own explanation), then every check
// grouped under a question an admin understands.

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
const apiFetchMock = vi.mocked(apiFetch);

vi.mock("@/hooks/useAuth", () => ({
  useCurrentUser: () => ({ user: { id: "u1", full_name: "Admin", role: "admin" }, isLoading: false, isAuthenticated: true, refetch: () => {} }),
}));

const ok = (message: string) => ({ status: "ok" as const, message });

function status(overrides: Record<string, unknown> = {}) {
  return {
    overall: "ok",
    checked_at: "2026-11-22T14:00:00Z",
    version: { commit: "abc1234", environment: "production" },
    database: { ...ok("Connected."), size_bytes: 52_428_800 },
    redis: ok("Connected."),
    workers: { ...ok("Worker and scheduler are running."), last_heartbeat_at: "2026-11-22T13:59:50Z", age_seconds: 10 },
    disk: { ...ok("Plenty of space."), total_bytes: 32 * 1024 ** 3, free_bytes: 20 * 1024 ** 3, used_percent: 37 },
    media: { ...ok("Patient photos and health-card PDFs."), size_bytes: 3_145_728, file_count: 42 },
    backup: {
      ...ok("Last backup is recent."), last_success_at: "2026-11-22T18:00:00Z", age_hours: 4,
      last_attempt_at: "2026-11-22T18:00:00Z", db_bytes: 1_048_576, media_bytes: 2_097_152,
      schedule: "daily at 02:00", keep_days: 14,
    },
    alerts: { ...ok("SMS failure alerts go to the admin phone."), admin_alert_phone_configured: true },
    reliability: {
      sms: {
        ...ok("SMS are going out."),
        last_24h: { sent: 12, failed: 0, stuck: 0, failure_percent: 0 },
        last_7d: { sent: 80, failed: 2, stuck: 0, failure_percent: 2.4 },
      },
      sign_in: {
        ...ok("Sign-ins are working."),
        last_24h: { successful: 5, failed_password: 1, failed_otp: 0, otp_sent: 5, otp_verified: 5, otp_success_percent: 100 },
        last_7d: { successful: 30, failed_password: 2, failed_otp: 1, otp_sent: 31, otp_verified: 30, otp_success_percent: 96.8 },
      },
      reminders: { ...ok("Last runs of the automatic reminders."), runs: [{ job: "appointment", last_run_at: "2026-11-22T13:00:00Z", queued: 2 }] },
    },
    ...overrides,
  };
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("System Health page", () => {
  it("says everything is working, and groups the checks under plain questions", async () => {
    apiFetchMock.mockResolvedValue(status() as never);
    render(<SystemHealthPage />);

    const hero = await screen.findByRole("status", { name: "Overall status" });
    expect(within(hero).getByText("Everything is working")).toBeInTheDocument();
    expect(within(hero).getByText("10 of 10 working")).toBeInTheDocument();
    expect(screen.queryByText("Needs your attention")).not.toBeInTheDocument();

    for (const question of ["Are patient records safe?", "Is the system running?", "Are messages and sign-ins going through?"]) {
      expect(screen.getByRole("heading", { name: question })).toBeInTheDocument();
    }
    // Plain names first; the technical name stays on the card, small.
    const redis = screen.getByRole("article", { name: "Sign-in codes and job queue" });
    expect(within(redis).getByText("Redis")).toBeInTheDocument();
    expect(within(redis).getByText("Working")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Storage space" })).getByRole("meter")).toHaveAttribute("aria-valuenow", "37");
    expect(screen.getByText("abc1234")).toBeInTheDocument();
  });

  it("lists what needs attention first, worst first, with the server's explanation", async () => {
    apiFetchMock.mockResolvedValue(
      status({
        overall: "error",
        alerts: { status: "warning", message: "Not set: SMS failure alerts go nowhere.", admin_alert_phone_configured: false },
        backup: {
          status: "error", message: "No backup in 3 days.", last_success_at: null, age_hours: null,
          last_attempt_at: null, db_bytes: null, media_bytes: null, schedule: null, keep_days: null,
        },
      }) as never,
    );
    render(<SystemHealthPage />);

    const hero = await screen.findByRole("status", { name: "Overall status" });
    expect(within(hero).getByText("Something is not working")).toBeInTheDocument();
    expect(within(hero).getByText("8 of 10 working")).toBeInTheDocument();

    const attention = screen.getByRole("region", { name: "Needs your attention" });
    const rows = within(attention).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Backups");
    expect(rows[0]).toHaveTextContent("No backup in 3 days.");
    expect(rows[0]).toHaveTextContent("Not working");
    expect(rows[1]).toHaveTextContent("Admin SMS alerts");
    expect(rows[1]).toHaveTextContent("Needs a look");
    expect(within(rows[0]).getByRole("link", { name: "Details" })).toHaveAttribute("href", "#check-backup");

    const backups = screen.getByRole("article", { name: "Backups" });
    expect(within(backups).getByText("No copy yet")).toBeInTheDocument();
  });

  it("works with an older backend that sends no reliability figures", async () => {
    const { reliability: _omit, ...older } = status();
    apiFetchMock.mockResolvedValue(older as never);
    render(<SystemHealthPage />);

    const hero = await screen.findByRole("status", { name: "Overall status" });
    expect(within(hero).getByText("7 of 7 working")).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "SMS delivery" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Admin SMS alerts" })).toBeInTheDocument();
  });
});
