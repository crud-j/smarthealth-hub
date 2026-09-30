"use client";

import Link from "next/link";
import { useState } from "react";
import { useIllnessTrends } from "@/hooks/useAnalytics";
import IllnessTrendChart from "@/components/charts/IllnessTrendChart";
import type { TrendGroupBy } from "@/types/analytics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultFrom(): string {
  const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().split("T")[0];
}
function defaultTo(): string { return new Date().toISOString().split("T")[0]; }

const GROUP_OPTIONS: { value: TrendGroupBy; label: string }[] = [
  { value: "week",  label: "Weekly"  },
  { value: "month", label: "Monthly" },
  { value: "year",  label: "Yearly"  },
];

const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500";
const labelCls = "mb-1.5 block text-xs font-medium text-slate-500";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IllnessTrendsPage() {
  const [from,    setFrom]    = useState(defaultFrom());
  const [to,      setTo]      = useState(defaultTo());
  const [groupBy, setGroupBy] = useState<TrendGroupBy>("month");
  const [applied, setApplied] = useState({
    from: defaultFrom(), to: defaultTo(), groupBy: "month" as TrendGroupBy,
  });

  const { data, loading, error } = useIllnessTrends(applied.from, applied.to, applied.groupBy);

  function handleApply() { setApplied({ from, to, groupBy }); }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">

      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/analytics"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:underline"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12,19 5,12 12,5" />
          </svg>
          Back to Analytics
        </Link>
      </div>

      {/* Page heading */}
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Illness Trends</h1>
        <p className="mt-2 text-sm text-slate-500">Diagnosis frequency trends over a custom date range.</p>
      </header>

      {/* Controls */}
      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Date range controls">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Date Range</h2>
        </div>
        <div className="flex flex-wrap items-end gap-4 p-5">
          <div className="min-w-[140px]">
            <label htmlFor="trend-from" className={labelCls}>From</label>
            <input id="trend-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="trend-to" className={labelCls}>To</label>
            <input id="trend-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="trend-groupby" className={labelCls}>Group by</label>
            <select
              id="trend-groupby"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as TrendGroupBy)}
              className={inputCls}
            >
              {GROUP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-100 hover:bg-rose-700 active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
          >
            Apply
          </button>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          Failed to load illness trends: {error.message}
        </div>
      )}

      {/* Chart card */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Diagnosis Frequency</h2>
            {data && (
              <p className="mt-0.5 text-sm text-slate-500">
                {new Date(data.from).toLocaleDateString("en-PH")} – {new Date(data.to).toLocaleDateString("en-PH")}
                <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                grouped by {data.groupBy}
              </p>
            )}
          </div>
        </div>

        <div className="p-5">
          <IllnessTrendChart points={data?.points ?? []} loading={loading} />

          {!loading && data && data.points.length === 0 && (
            <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-700">No illness data recorded in this period.</p>
              <p className="mt-1 text-xs text-slate-500">Try selecting a wider date range.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
