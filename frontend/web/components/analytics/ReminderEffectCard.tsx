"use client";

import { useState } from "react";
import { useReminderEffect } from "@/hooks/useAnalytics";
import { ReminderEffectSummary } from "@/components/dashboard/ReminderEffect";

const WINDOWS = [30, 90] as const;
type WindowDays = (typeof WINDOWS)[number];

/**
 * Analytics card: return rate after SMS reminders, last 30 or 90 days.
 * Evidence for the thesis's SMS-notification objective.
 */
export default function ReminderEffectCard() {
  const [days, setDays] = useState<WindowDays>(30);
  const { data, loading, error } = useReminderEffect(days);

  return (
    <section aria-label="SMS reminders" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">SMS Reminders</h2>
          <p className="mt-0.5 text-sm text-slate-500">Did patients come more often after a reminder SMS?</p>
        </div>
        <div role="group" aria-label="Period" className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={days === w}
              onClick={() => setDays(w)}
              className={`min-h-[36px] rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-rose-500 ${
                days === w ? "bg-rose-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {w} days
            </button>
          ))}
        </div>
      </div>
      <div className="p-5">
        {error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
            Could not load the reminder figures. Please try again later.
          </p>
        ) : loading || !data ? (
          <div className="space-y-4" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
                <div className="h-2 animate-pulse rounded-full bg-slate-100" />
              </div>
            ))}
          </div>
        ) : (
          <ReminderEffectSummary data={data} />
        )}
      </div>
    </section>
  );
}
