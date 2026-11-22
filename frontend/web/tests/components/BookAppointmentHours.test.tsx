import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewAppointmentPage from "@/app/(dashboard)/appointments/new/page";
import type { ClinicHours } from "@/lib/clinic-hours";

// Book Appointment shows the clinic hours and flags a time outside them
// (a 12:00 AM booking meant for noon slipped through before). The server
// refuses such bookings too; this catches it while picking.

const fetchClinicHours = vi.fn<() => Promise<ClinicHours | null>>();
const createAppointment = vi.fn();

vi.mock("@/hooks/useAppointments", () => ({
  fetchClinicHours: () => fetchClinicHours(),
  useCreateAppointment: () => ({ createAppointment, loading: false, error: null }),
}));

vi.mock("@/hooks/usePatients", () => ({
  usePatientList: () => ({ data: { items: [], total: 0 }, loading: false, error: null, refetch: () => {} }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

async function renderPage() {
  await act(async () => {
    render(<NewAppointmentPage />);
  });
}

beforeEach(() => {
  fetchClinicHours.mockReset();
  createAppointment.mockReset();
  fetchClinicHours.mockResolvedValue({ openTime: "07:00", closeTime: "17:00" });
});

describe("Book Appointment clinic hours", () => {
  it("shows the clinic hours and limits the time picker", async () => {
    await renderPage();
    expect(await screen.findByText("Clinic hours: 7:00 AM to 5:00 PM")).toBeInTheDocument();
    const time = screen.getByLabelText(/Time/);
    expect(time).toHaveAttribute("min", "07:00");
    expect(time).toHaveAttribute("max", "17:00");
    // The default 8:00 AM is fine.
    expect(screen.queryByText(/can only be booked during clinic hours/)).not.toBeInTheDocument();
  });

  it("flags 12:00 AM right away and says to check AM / PM", async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText(/Time/), { target: { value: "00:00" } });
    const alert = await screen.findByText(/can only be booked during clinic hours, 7:00 AM to 5:00 PM/);
    expect(alert).toHaveTextContent("check AM / PM");
  });

  it("uses the hours the Admin set", async () => {
    fetchClinicHours.mockResolvedValue({ openTime: "08:00", closeTime: "12:00" });
    await renderPage();
    await waitFor(() => expect(screen.getByText("Clinic hours: 8:00 AM to 12:00 PM")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Time/), { target: { value: "13:00" } });
    expect(await screen.findByText(/8:00 AM to 12:00 PM\. Pick a time/)).toBeInTheDocument();
  });

  it("keeps the usual hours if they cannot be loaded", async () => {
    fetchClinicHours.mockResolvedValue(null);
    await renderPage();
    expect(await screen.findByText("Clinic hours: 7:00 AM to 5:00 PM")).toBeInTheDocument();
  });
});
