"use client";

/**
 * Analytics main page — Phase 5.
 *
 * Two charts side by side:
 *  - VaccinationCoverageChart (horizontal bars, coverage % by vaccine)
 *  - PatientVisitsChart (line chart, visit counts grouped by week)
 *
 * Visit data is aggregated client-side via analyticsAggregator.worker.ts
 * (groupByWeek), with a synchronous fallback per SDP §7.4.4.
 *
 * Also links to sub-pages: Illness Trends and Reports.
 */

import Link from "next/link";
import { useVaccinationCoverage, useDashboardOverview } from "@/hooks/useAnalytics";
import VaccinationCoverageChart from "@/components/charts/VaccinationCoverageChart";

// ---------------------------------------------------------------------------
// Sub-page navigation cards
// ---------------------------------------------------------------------------

function SubPageCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[44px] flex-col gap-1 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500"
    >
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="text-sm text-slate-500">{description}</p>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const { data: coverageData, loading: coverageLoading } = useVaccinationCoverage();
  const { data: overviewData, loading: overviewLoading } = useDashboardOverview();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Real-time health center metrics and trend analysis
        </p>
      </div>

      {/* Sub-page navigation */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SubPageCard
          href="/analytics/illness-trends"
          title="Illness Trends"
          description="View diagnosis trends over custom date ranges"
        />
        <SubPageCard
          href="/analytics/reports"
          title="Export Reports"
          description="Download CSV or JSON reports for LGU/DOH submission"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Vaccination Coverage */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 font-semibold text-slate-900">Vaccination Coverage</h2>
          <p className="mb-4 text-xs text-slate-500">Completion rate by vaccine</p>
          <VaccinationCoverageChart
            items={coverageData?.byVaccine ?? []}
            loading={coverageLoading}
          />
        </div>

        {/* Quick Stats */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 font-semibold text-slate-900">This Week</h2>
          <p className="mb-4 text-xs text-slate-500">Key activity metrics for the current week</p>
          <div className="space-y-4">
            {overviewLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                  <div className="h-7 w-12 animate-pulse rounded bg-slate-200" />
                </div>
              ))
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-600">Visits this week</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {overviewData?.visitsThisWeek ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-600">Upcoming appointments</span>
                  <span className="text-2xl font-bold text-amber-600">
                    {overviewData?.upcomingAppointments ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-600">Immunizations due this week</span>
                  <span className="text-2xl font-bold text-green-600">
                    {overviewData?.immunizationsDue ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Total active patients</span>
                  <span className="text-2xl font-bold text-teal-600">
                    {overviewData?.totalActivePatients ?? 0}
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="mt-4">
            <Link href="/analytics/illness-trends" className="text-xs text-teal-600 hover:underline">
              View illness trends →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
