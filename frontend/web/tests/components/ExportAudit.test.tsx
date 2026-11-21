import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuditLogPage from "@/app/(dashboard)/settings/audit-log/page";
import ReportsPage from "@/app/(dashboard)/analytics/reports/page";
import { apiFetch } from "@/lib/api-client";

// Every report export writes an EXPORT_REPORT audit row (backend). The Reports
// page says so, and the Audit Log page lets the admin filter for it.

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});
const apiFetchMock = vi.mocked(apiFetch);

vi.mock("@/hooks/useAuth", () => ({
  useCurrentUser: () => ({
    user: { id: "u-1", full_name: "System Admin", role: "admin" },
    isLoading: false,
    isAuthenticated: true,
    refetch: () => {},
  }),
}));

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 } as never);
});

describe("Audit Log page", () => {
  it("offers report exports as an action filter", async () => {
    render(<AuditLogPage />);
    const select = await screen.findByLabelText("Action");
    const values = within(select).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(values).toContain("EXPORT_REPORT");
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
  });
});

describe("Reports page", () => {
  it("tells staff that exports are recorded in the audit log", () => {
    render(<ReportsPage />);
    expect(screen.getByText(/every export is recorded in the audit log/i)).toBeInTheDocument();
  });

  it("does not promise diagnosis records in the visits report", () => {
    render(<ReportsPage />);
    const visits = screen.getByText("Visits").closest("label");
    expect(visits).not.toBeNull();
    expect(visits?.textContent ?? "").not.toMatch(/diagnos/i);
  });
});
