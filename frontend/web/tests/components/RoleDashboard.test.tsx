import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/(dashboard)/dashboard/page";
import { apiFetch, ApiError } from "@/lib/api-client";
import type {
  AdminDashboardData,
  AdminStaffDashboardData,
  BhwDashboardData,
  PhysicianDashboardData,
} from "@/types/dashboard";

// /dashboard shows content for the signed-in role, decided by the server
// (GET /dashboard/me). Until the backend is deployed (404) it shows the older
// one-size dashboard.

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
const apiFetchMock = vi.mocked(apiFetch);

const ref = (id: string, full_name: string) => ({ id, patient_code: `BHC-${id}`, full_name });
const TODAY = "2026-11-22";

function serve(dashboard: unknown) {
  apiFetchMock.mockImplementation(async (path: string) => {
    if (path === "/dashboard/me") {
      if (dashboard instanceof Error) throw dashboard;
      return dashboard as never;
    }
    // Older dashboard's data sources (used only by the 404 fallback).
    if (path.startsWith("/analytics/overview")) {
      return {
        total_active_patients: 312, visits_this_week: 4, visits_this_month: 9,
        upcoming_appointments_count: 3, immunizations_due_this_week: 2,
        senior_count: 0, pwd_count: 0, pregnant_count: 0,
      } as never;
    }
    if (path.startsWith("/intake/pending")) return [] as never;
    return { items: [], total: 0, page: 1, page_size: 5 } as never;
  });
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

const physician: PhysicianDashboardData = {
  role: "physician",
  first_name: "Rosa",
  today: TODAY,
  waiting_count: 3,
  waiting: [
    {
      visit_id: "v1", patient: ref("p1", "Waiting Child"), age: 2,
      visit_date: "2026-11-22T00:52:00Z", visit_type: "consultation",
      recorded_by_name: "Field Worker", temperature: 38.4, blood_pressure: null,
      pulse_rate: null, oxygen_saturation: null, weight_kg: 11.2,
    },
  ],
  consultations_today: 0,
  consultations_week: 21,
  follow_ups_due_7d: 5,
  appointments_today_count: 1,
  appointments_today: [
    {
      id: "a1", patient: ref("p2", "Prenatal Mother"), appointment_type: "prenatal",
      scheduled_at: "2026-11-22T01:30:00Z", status: "confirmed", intake_completed: true,
    },
  ],
  top_conditions_month: [{ condition_name: "URTI", count: 11 }],
};

describe("Dashboard page", () => {
  it("shows the physician's waiting queue with vital signs and links to the patient's history", async () => {
    serve(physician);
    render(<DashboardPage />);

    expect(await screen.findByText(/Rosa/)).toBeInTheDocument();
    const waiting = screen.getByRole("region", { name: /Waiting to be seen/ });
    expect(within(waiting).getByText("Waiting Child")).toBeInTheDocument();
    expect(within(waiting).getByText(/38\.4 °C/)).toBeInTheDocument();
    expect(within(waiting).getByText(/Field Worker/)).toBeInTheDocument();
    expect(within(waiting).getByRole("link", { name: /Waiting Child/ })).toHaveAttribute(
      "href",
      "/patients/p1/history"
    );
    expect(screen.getByText("URTI")).toBeInTheDocument();
    expect(document.body.textContent?.toLowerCase()).not.toContain("diagnosis:");
  });

  it("groups the BHW's due immunizations by sitio/purok and flags overdue doses", async () => {
    const bhw: BhwDashboardData = {
      role: "bhw", first_name: "Lito", today: TODAY,
      immunizations_due_7d: 2, immunizations_overdue: 1,
      immunizations_due: [
        { id: "i1", patient: ref("p1", "Late Baby"), sitio_purok: "Purok 3", vaccine_name: "Pentavalent", dose_number: 2, next_due_date: "2026-11-18", overdue: true },
        { id: "i2", patient: ref("p2", "Soon Baby"), sitio_purok: "Purok 5", vaccine_name: "MMR", dose_number: 1, next_due_date: "2026-11-26", overdue: false },
      ],
      missed_appointments_7d: 0, missed_appointments: [],
      sms_today_sent: 5, sms_today_failed: 1,
      failed_sms: [{ id: "s1", patient: ref("p3", "Wrong Number"), kind: "immunization", created_at: "2026-11-22T02:00:00Z", reason: "Invalid number" }],
      appointments_today_count: 9, previsit_forms_waiting: 2,
      visits_logged_by_me_week: 14, patients_without_active_card: 7,
    };
    serve(bhw);
    render(<DashboardPage />);

    const panel = await screen.findByRole("region", { name: /Immunizations due/ });
    expect(within(panel).getByText("Purok 3")).toBeInTheDocument();
    expect(within(panel).getByText("Purok 5")).toBeInTheDocument();
    expect(within(panel).getByText(/Overdue/)).toBeInTheDocument();
    expect(screen.getByText("Invalid number")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Scan card/ })).toHaveAttribute("href", "/health-cards/verify");
  });

  it("shows the admin system status and registrations, and nothing clinical", async () => {
    const admin: AdminDashboardData = {
      role: "admin", first_name: "Admin", today: TODAY,
      system: {
        overall: "ok",
        version: { commit: "a1b2c3d", environment: "production" },
        database: { status: "ok" },
        workers: { status: "ok", message: "Workers running" },
        disk: { status: "ok", used_percent: 26 },
        backup: { status: "ok", message: "Backup OK", last_success_at: "2026-11-21T18:00:00Z" },
        reliability: {
          sms: { status: "ok", last_24h: { sent: 3, failed: 0 } },
          sign_in: { status: "ok", last_24h: { successful: 9, failed_password: 2, failed_otp: 0 } },
          reminders: { runs: [{ job: "immunization", last_run_at: "2026-11-22T02:00:00Z", queued: 5 }] },
        },
      },
      online_applications_pending: 3, previsit_forms_waiting: 1,
      recent_applications: [{ id: "r1", reference_number: "REF-1", applicant_name: "Online Applicant", created_at: "2026-11-21T03:00:00Z" }],
      staff: { active: 6, inactive: 0, not_signed_in_30d: 1 },
      active_patients: 312, security_alerts: [],
    };
    serve(admin);
    render(<DashboardPage />);

    expect(await screen.findByText(/a1b2c3d/)).toBeInTheDocument();
    expect(screen.getByText("Online Applicant")).toBeInTheDocument();
    expect(screen.getByText(/No security alerts/)).toBeInTheDocument();
    expect(screen.queryByText(/Waiting to be seen/)).not.toBeInTheDocument();
  });

  it("shows the front desk today's appointments with pre-visit form status", async () => {
    const staff: AdminStaffDashboardData = {
      role: "admin_staff", first_name: "Desk", today: TODAY,
      appointments_today_count: 2, intake_done_today: 1, previsit_forms_waiting: 2,
      appointments_today: [
        { id: "a1", patient: ref("p1", "Form Done"), appointment_type: "prenatal", scheduled_at: "2026-11-22T01:30:00Z", status: "confirmed", intake_completed: true },
        { id: "a2", patient: ref("p2", "Form Missing"), appointment_type: "general_checkup", scheduled_at: "2026-11-22T02:00:00Z", status: "pending", intake_completed: false },
      ],
      appointments_tomorrow_count: 7,
    };
    serve(staff);
    render(<DashboardPage />);

    const list = await screen.findByRole("region", { name: /Today's appointments/ });
    const done = within(list).getByText("Form Done").closest("li");
    const missing = within(list).getByText("Form Missing").closest("li");
    expect(done).toHaveTextContent(/Form ✓/);
    expect(missing).toHaveTextContent(/No form yet/);
    expect(screen.getByText(/Tomorrow: 7 appointments/)).toBeInTheDocument();
  });

  it("falls back to the older dashboard while the backend has no /dashboard/me (404)", async () => {
    serve(new ApiError("Not Found", 404, "not_found"));
    render(<DashboardPage />);

    expect(await screen.findByText("Total Active Patients")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("312")).toBeInTheDocument());
  });

  it("shows an error, not the old dashboard, when /dashboard/me fails otherwise", async () => {
    serve(new ApiError("Server error", 500, "api_error"));
    render(<DashboardPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Server error/);
    expect(screen.queryByText("Total Active Patients")).not.toBeInTheDocument();
  });
});
