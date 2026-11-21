"use client";

import Link from "next/link";
import {
  Activity, ArrowRight, CalendarCheck, CalendarClock, ClipboardCheck, Clock, Coffee,
  HeartPulse, Hourglass, Scale, Stethoscope, Thermometer, TrendingUp, Wind,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PhysicianDashboardData, WaitingVisit } from "@/types/dashboard";
import {
  Avatar, Chip, DashboardHeader, EmptyRow, Panel, RowList, StatCard, StatGrid, StatusBadge,
  TwoColumns, formatTime, humanize, text,
} from "./shared";

/** Vital signs the BHW recorded, as icon chips. Never clinical notes. */
function vitalChips(v: WaitingVisit): { icon: LucideIcon; label: string; alert: boolean }[] {
  const chips: { icon: LucideIcon; label: string; alert: boolean }[] = [];
  if (v.temperature !== null) chips.push({ icon: Thermometer, label: `${v.temperature} °C`, alert: v.temperature >= 37.8 });
  if (v.blood_pressure) chips.push({ icon: HeartPulse, label: `BP ${v.blood_pressure}`, alert: false });
  if (v.pulse_rate !== null) chips.push({ icon: Activity, label: `${v.pulse_rate} bpm`, alert: false });
  if (v.oxygen_saturation !== null) chips.push({ icon: Wind, label: `SpO₂ ${v.oxygen_saturation}%`, alert: v.oxygen_saturation < 95 });
  if (v.weight_kg !== null) chips.push({ icon: Scale, label: `${v.weight_kg} kg`, alert: false });
  return chips;
}

function summary(d: PhysicianDashboardData): string {
  if (d.waiting_count === 0) return "No one is waiting for you right now.";
  return d.waiting_count === 1 ? "1 patient is waiting to be seen." : `${d.waiting_count} patients are waiting to be seen.`;
}

export default function PhysicianDashboard({ data }: { data: PhysicianDashboardData }) {
  const maxCondition = Math.max(1, ...data.top_conditions_month.map((c) => c.count));

  return (
    <>
      <DashboardHeader
        firstName={data.first_name}
        today={data.today}
        roleLabel="Physician"
        roleIcon={Stethoscope}
        summary={summary(data)}
      />

      <StatGrid>
        <StatCard index={0} label="Waiting to be seen" value={data.waiting_count} sub="today, no diagnosis yet" icon={Hourglass} emphasis />
        <StatCard
          index={1}
          label="Consultations done"
          value={<>{data.consultations_today}<span className={`text-2xl ${text.muted}`}> · {data.consultations_week}</span></>}
          sub="today · this week"
          icon={ClipboardCheck}
          tone="teal"
        />
        <StatCard index={2} label="Follow-ups due" value={data.follow_ups_due_7d} sub="next 7 days" icon={CalendarClock} tone="amber" href="/appointments" />
        <StatCard index={3} label="Today's appointments" value={data.appointments_today_count} sub="on the schedule" icon={CalendarCheck} tone="sky" href="/appointments" />
      </StatGrid>

      <Panel title="Waiting to be seen" icon={Hourglass} count={data.waiting_count} className="mb-6" index={5}>
        <RowList>
          {data.waiting.length === 0 ? (
            <EmptyRow icon={Coffee} hint="Visits logged today without a diagnosis appear here.">No one is waiting.</EmptyRow>
          ) : (
            data.waiting.map((v) => (
              <li key={v.visit_id} className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-rose-50/40">
                <Avatar name={v.patient.full_name} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/patients/${v.patient.id}/history`}
                    className={`block truncate text-sm font-semibold hover:text-rose-700 hover:underline focus-visible:underline focus-visible:outline-none ${text.ink}`}
                  >
                    {v.patient.full_name}
                  </Link>
                  <p className={`mt-0.5 flex flex-wrap items-center gap-x-2 text-xs ${text.muted}`}>
                    {v.age !== null && <span>{v.age} yrs</span>}
                    <span>· {humanize(v.visit_type)}</span>
                    <span className="inline-flex items-center gap-1">· <Clock size={11} aria-hidden="true" /> {formatTime(v.visit_date)}</span>
                    {v.recorded_by_name && <span>· logged by {v.recorded_by_name}</span>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {vitalChips(v).length === 0 ? (
                      <Chip tone="slate">No vital signs recorded</Chip>
                    ) : (
                      vitalChips(v).map((c) => (
                        <Chip key={c.label} icon={c.icon} tone={c.alert ? "red" : "teal"}>{c.label}</Chip>
                      ))
                    )}
                  </div>
                </div>
                <Link
                  href={`/patients/${v.patient.id}/history`}
                  aria-hidden="true"
                  tabIndex={-1}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-rose-700"
                >
                  Open <ArrowRight size={14} />
                </Link>
              </li>
            ))
          )}
        </RowList>
        {data.waiting_count > data.waiting.length && (
          <p className={`border-t border-[#f4ebe6] px-5 py-2 text-xs ${text.muted}`}>
            Showing the first {data.waiting.length} of {data.waiting_count}.
          </p>
        )}
      </Panel>

      <TwoColumns>
        <Panel title="Today's appointments" icon={CalendarCheck} tone="sky" count={data.appointments_today_count} href="/appointments" index={6}>
          <RowList>
            {data.appointments_today.length === 0 ? (
              <EmptyRow icon={CalendarCheck}>No appointments today.</EmptyRow>
            ) : (
              data.appointments_today.map((a) => (
                <li key={a.id}>
                  <Link href={`/appointments/${a.id}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-rose-50/40 focus-visible:bg-rose-50/40 focus-visible:outline-none">
                    <span className="w-20 shrink-0 whitespace-nowrap font-display text-lg text-rose-700">{formatTime(a.scheduled_at)}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-semibold ${text.ink}`}>{a.patient.full_name}</span>
                      <span className={`block text-xs ${text.muted}`}>{humanize(a.appointment_type)}</span>
                    </span>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))
            )}
          </RowList>
        </Panel>

        <Panel title="Top conditions this month" icon={TrendingUp} tone="amber" href="/analytics/illness-trends" linkLabel="Trends" index={7}>
          {data.top_conditions_month.length === 0 ? (
            <RowList><EmptyRow icon={TrendingUp}>No conditions recorded this month.</EmptyRow></RowList>
          ) : (
            <ol className="space-y-4 px-5 py-5">
              {data.top_conditions_month.map((c, i) => (
                <li key={c.condition_name} className="text-sm">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className={`flex items-center gap-2 font-medium ${text.ink}`}>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-800">{i + 1}</span>
                      {c.condition_name}
                    </span>
                    <span className={`font-display text-lg ${text.ink}`}>{c.count}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-amber-50" aria-hidden="true">
                    <div className="h-full rounded-full bg-linear-to-r from-amber-400 to-rose-500 transition-[width] duration-700" style={{ width: `${(c.count / maxCondition) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </TwoColumns>
    </>
  );
}
