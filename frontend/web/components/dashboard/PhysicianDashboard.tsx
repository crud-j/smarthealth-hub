"use client";

import Link from "next/link";
import type { PhysicianDashboardData, WaitingVisit } from "@/types/dashboard";
import {
  DashboardHeader, EmptyRow, Panel, RowList, StatCard, StatGrid, StatusBadge, TwoColumns,
  formatTime, humanize,
} from "./shared";

/** Vital signs the BHW recorded, e.g. "Temp 38.4 °C · Wt 11.2 kg". Never clinical notes. */
function vitals(v: WaitingVisit): string {
  const parts = [
    v.temperature !== null ? `Temp ${v.temperature} °C` : null,
    v.blood_pressure ? `BP ${v.blood_pressure}` : null,
    v.pulse_rate !== null ? `Pulse ${v.pulse_rate}` : null,
    v.oxygen_saturation !== null ? `SpO₂ ${v.oxygen_saturation}%` : null,
    v.weight_kg !== null ? `Wt ${v.weight_kg} kg` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No vital signs recorded";
}

export default function PhysicianDashboard({ data }: { data: PhysicianDashboardData }) {
  const maxCondition = Math.max(1, ...data.top_conditions_month.map((c) => c.count));

  return (
    <>
      <DashboardHeader firstName={data.first_name} today={data.today} roleLabel="Physician" />

      <StatGrid>
        <StatCard label="Waiting to be seen" value={data.waiting_count} sub="today, no diagnosis yet" emphasis />
        <StatCard
          label="Consultations done"
          value={`${data.consultations_today} · ${data.consultations_week}`}
          sub="today · this week"
        />
        <StatCard label="Follow-ups due" value={data.follow_ups_due_7d} sub="next 7 days" href="/appointments" />
        <StatCard label="Today's appointments" value={data.appointments_today_count} href="/appointments" />
      </StatGrid>

      <Panel title="Waiting to be seen" className="mb-6">
        <RowList>
          {data.waiting.length === 0 ? (
            <EmptyRow>No one is waiting. Visits logged today without a diagnosis appear here.</EmptyRow>
          ) : (
            data.waiting.map((v) => (
              <li key={v.visit_id}>
                <Link
                  href={`/patients/${v.patient.id}/history`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">{v.patient.full_name}</span>
                    <span className="block text-sm text-slate-500">
                      {v.age !== null ? `${v.age} yrs · ` : ""}{humanize(v.visit_type)} · {formatTime(v.visit_date)}
                      {v.recorded_by_name ? ` · logged by ${v.recorded_by_name}` : ""}
                    </span>
                    <span className="block text-sm text-slate-700">{vitals(v)}</span>
                  </span>
                  <span className="text-sm font-medium text-rose-600">Open →</span>
                </Link>
              </li>
            ))
          )}
        </RowList>
        {data.waiting_count > data.waiting.length && (
          <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
            Showing the first {data.waiting.length} of {data.waiting_count}.
          </p>
        )}
      </Panel>

      <TwoColumns>
        <Panel title="Today's appointments" href="/appointments">
          <RowList>
            {data.appointments_today.length === 0 ? (
              <EmptyRow>No appointments today.</EmptyRow>
            ) : (
              data.appointments_today.map((a) => (
                <li key={a.id}>
                  <Link href={`/appointments/${a.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                    <span className="min-w-0 text-sm">
                      <span className="font-mono text-slate-500">{formatTime(a.scheduled_at)}</span>{" "}
                      <span className="font-medium text-slate-900">{a.patient.full_name}</span>{" "}
                      <span className="text-slate-500">· {humanize(a.appointment_type)}</span>
                    </span>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))
            )}
          </RowList>
        </Panel>

        <Panel title="Top conditions this month" href="/analytics/illness-trends" linkLabel="Illness trends">
          {data.top_conditions_month.length === 0 ? (
            <RowList><EmptyRow>No conditions recorded this month.</EmptyRow></RowList>
          ) : (
            <ul role="list" className="space-y-3 px-5 py-4">
              {data.top_conditions_month.map((c) => (
                <li key={c.condition_name} className="text-sm">
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="text-slate-900">{c.condition_name}</span>
                    <span className="font-medium text-slate-600">{c.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100" aria-hidden="true">
                    <div className="h-2 rounded-full bg-rose-500" style={{ width: `${(c.count / maxCondition) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </TwoColumns>
    </>
  );
}
