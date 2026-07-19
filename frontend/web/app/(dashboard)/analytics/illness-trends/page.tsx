"use client";

/**
 * Illness Trends page — Phase 5.
 *
 * Date range picker + group_by toggle (week/month/year).
 * IllnessTrendChart shows condition_name series over time.
 * Loading skeleton while data is fetching.
 */

import Link from "next/link";
import { useState } from "react";
import { useIllnessTrends } from "@/hooks/useAnalytics";
import IllnessTrendChart from "@/components/charts/IllnessTrendChart";
import type { TrendGroupBy } from "@/types/analytics";

// Default to last 6 months
function defaultFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().split("T")[0];
}
function defaultTo(): string {
  return new Date().toISOString().split("T")[0];
}

const GROUP_OPTIONS: { value: TrendGroupBy; label: string }[] = [
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

export default function IllnessTrendsPage() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [groupBy, setGroupBy] = useState<TrendGroupBy>("month");
  const [applied, setApplied] = useState({ from: defaultFrom(), to: defaultTo(), groupBy: "month" as TrendGroupBy });

  const { data, loading, error } = useIllnessTrends(
    applied.from,
    applied.to,
    applied.groupBy
  );

  function handleApply() {
    setApplied({ from, to, groupBy });
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Back link */}
      <div className="mb-4">
        <Link href="/analytics" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-800">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12,19 5,12 12,5" />
          </svg>
          Back to Analytics
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Illness Trends</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Diagnosis frequency trends over a custom date range
        </p>
      </div>

      {/* Controls */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px]">
            <label htmlFor="trend-from" className="mb-1.5 block text-xs font-medium text-slate-600">From</label>
            <input id="trend-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="trend-to" className="mb-1.5 block text-xs font-medium text-slate-600">To</label>
            <input id="trend-to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="trend-groupby" className="mb-1.5 block text-xs font-medium text-slate-600">Group by</label>
            <select id="trend-groupby" value={groupBy} onChange={(e) => setGroupBy(e.target.value as TrendGroupBy)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              {GROUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={handleApply}
            className="min-h-[44px] rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">
            Apply
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          Failed to load illness trends: {error.message}
        </div>
      )}

      {/* Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Diagnosis Frequency</h2>
          {data && (
            <p className="text-xs text-slate-400">
              {new Date(data.from).toLocaleDateString("en-PH")} —{" "}
              {new Date(data.to).toLocaleDateString("en-PH")} · grouped by {data.groupBy}
            </p>
          )}
        </div>
        <IllnessTrendChart
          points={data?.points ?? []}
          loading={loading}
        />
        {!loading && data && data.points.length === 0 && (
          <p className="mt-2 text-center text-sm text-slate-400">
            No illness data recorded in this period.
          </p>
        )}
      </div>
    </div>
  );
}
