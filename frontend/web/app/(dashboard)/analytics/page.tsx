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
import { useEffect, useState } from "react";
import { useVaccinationCoverage, useDashboardOverview } from "@/hooks/useAnalytics";
import { useWebWorker } from "@/hooks/useWebWorker";
import VaccinationCoverageChart from "@/components/charts/VaccinationCoverageChart";
import PatientVisitsChart from "@/components/charts/PatientVisitsChart";
import type {
  AnalyticsAggregatorApi,
  TimeSeriesPoint,
} from "@/workers/analyticsAggregator.worker";

// ---------------------------------------------------------------------------
// Synchronous fallback for groupByWeek (used when Worker is unavailable)
// ---------------------------------------------------------------------------

function groupByWeekSync(records: { date: string }[]): TimeSeriesPoint[] {
  const counts: Record<string, number> = {};
  for (const r of records) {
    const d = new Date(r.date);
    const year = d.getUTCFullYear();
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil(
      ((d.getTime() - startOfYear.getTime()) / 86_400_000 +
        startOfYear.getUTCDay() +
        1) /
        7
    );
    const key = `${year}-W${String(week).padStart(2, "0")}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));
}

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
  const { data: overviewData } = useDashboardOverview();

  // analyticsAggregator worker for visit grouping
  const aggregator = useWebWorker<AnalyticsAggregatorApi>(
    new URL("../../../workers/analyticsAggregator.worker.ts", import.meta.url)
  );

  const [visitPoints, setVisitPoints] = useState<TimeSeriesPoint[]>([]);
  const [aggregating, setAggregating] = useState(false);

  // When overview data arrives, aggregate visits into weekly series
  useEffect(() => {
    if (!overviewData) return;

    // Build date records from recent patients (as a proxy for visit activity)
    // In a real impl this would come from a dedicated visits-over-time endpoint.
    // Here we use recentPatients.createdAt as a demonstration.
    const records = overviewData.recentPatients.map((p) => ({
      date: p.createdAt,
    }));

    setAggregating(true);

    if (aggregator) {
      aggregator
        .groupByWeek(records)
        .then(setVisitPoints)
        .catch(() => setVisitPoints(groupByWeekSync(records)))
        .finally(() => setAggregating(false));
    } else {
      // Synchronous fallback
      setVisitPoints(groupByWeekSync(records));
      setAggregating(false);
    }
  }, [overviewData, aggregator]);

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
            items={coverageData?.items ?? []}
            loading={coverageLoading}
          />
          {coverageData?.asOf && (
            <p className="mt-2 text-right text-xs text-slate-400">
              As of {new Date(coverageData.asOf).toLocaleDateString("en-PH")}
            </p>
          )}
        </div>

        {/* Patient Visits */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 font-semibold text-slate-900">Recent Activity</h2>
          <p className="mb-4 text-xs text-slate-500">Patient registrations grouped by week</p>
          <PatientVisitsChart
            points={visitPoints}
            loading={aggregating}
            title="Patient Registrations by Week"
          />
        </div>
      </div>
    </div>
  );
}
