import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AnalyticsPage from "@/app/(dashboard)/analytics/page";

// Analytics overview: Export reports and Illness trends at the top (not at
// the very bottom), content grouped into four plainly named sections, and
// every card saying which period it covers.

vi.mock("@/hooks/useAnalytics", () => ({
  useDashboardOverview: () => ({
    data: {
      totalActivePatients: 61, visitsThisWeek: 8, immunizationsDue: 10, upcomingAppointments: 14,
      seniorCount: 5, pwdCount: 3, pregnantCount: 3,
    },
    loading: false,
  }),
  useVaccinationCoverage: () => ({ data: { byVaccine: [], byAgeGroup: [] }, loading: false }),
  useVisitTrends: () => ({ data: [], loading: false }),
  useVisitTypeBreakdown: () => ({ data: { items: [] }, loading: false }),
  useReminderEffect: () => ({ data: null, loading: true, error: null }),
}));

vi.mock("@/hooks/useAiAnalytics", () => ({
  useNoShowRisk: () => ({ data: null, loading: false }),
  useAnomalyAlerts: () => ({ data: null, loading: false }),
}));

// Charts are covered elsewhere; here only the page layout matters.
vi.mock("@/components/charts/PatientVisitsChart", () => ({ default: () => <div>visits chart</div> }));
vi.mock("@/components/charts/VaccinationCoverageChart", () => ({ default: () => <div>coverage chart</div> }));
vi.mock("@/components/charts/VisitTypeBreakdownChart", () => ({ default: () => <div>visit types chart</div> }));
vi.mock("@/components/charts/PatientDemographicsChart", () => ({ default: () => <div>demographics chart</div> }));
vi.mock("@/components/analytics/NoShowRiskPanel", () => ({ default: () => <div>risk panel</div> }));
vi.mock("@/components/analytics/AnomalyAlertBanner", () => ({ default: () => null }));

function follows(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("Analytics page", () => {
  it("puts Export reports and Illness trends in the header, above all content", () => {
    render(<AnalyticsPage />);

    const header = screen.getByRole("banner");
    const exportLink = within(header).getByRole("link", { name: /Export reports/ });
    expect(exportLink).toHaveAttribute("href", "/analytics/reports");
    expect(within(header).getByRole("link", { name: /Illness trends/ })).toHaveAttribute(
      "href",
      "/analytics/illness-trends",
    );
    expect(follows(exportLink, screen.getByRole("region", { name: "At a glance" }))).toBe(true);
    // Only one way in, at the top: no second export card at the bottom.
    expect(screen.getAllByRole("link", { name: /Export reports/ })).toHaveLength(1);
  });

  it("groups the content into four named sections, in order", () => {
    render(<AnalyticsPage />);

    const names = ["At a glance", "Visits", "Patients", "Reminders and follow-up"];
    const sections = names.map((name) => screen.getByRole("region", { name }));
    for (let i = 1; i < sections.length; i++) {
      expect(follows(sections[i - 1], sections[i])).toBe(true);
    }
    expect(within(sections[1]).getByText("visits chart")).toBeInTheDocument();
    expect(within(sections[1]).getByText("visit types chart")).toBeInTheDocument();
    expect(within(sections[2]).getByText("demographics chart")).toBeInTheDocument();
    expect(within(sections[2]).getByText("coverage chart")).toBeInTheDocument();
    expect(within(sections[3]).getByText("risk panel")).toBeInTheDocument();
  });

  it("says which period each figure covers", () => {
    render(<AnalyticsPage />);

    const glance = screen.getByRole("region", { name: "At a glance" });
    expect(within(glance).getByText(/this week/i)).toBeInTheDocument();
    expect(within(glance).getByText(/next 7 days/i)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Visits" })).getByText("Last 12 weeks")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Visits" })).getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });
});
