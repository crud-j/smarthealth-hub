"use client";

import Link from "next/link";
import {
  ArrowRight, CalendarCheck, CalendarPlus, ClipboardCheck, ClipboardList, ClipboardX,
  ConciergeBell, FileClock, QrCode, Sunrise, UserPlus,
} from "lucide-react";
import type { AdminStaffDashboardData } from "@/types/dashboard";
import {
  DashboardHeader, EmptyRow, Panel, StatCard, StatusBadge, formatTime, humanize, rise, text,
} from "./shared";

export default function AdminStaffDashboard({ data }: { data: AdminStaffDashboardData }) {
  const pct = data.appointments_today_count
    ? Math.round((data.intake_done_today / data.appointments_today_count) * 100)
    : 0;
  const tomorrow = rise(12);

  return (
    <>
      <DashboardHeader
        firstName={data.first_name}
        today={data.today}
        roleLabel="Front desk"
        roleIcon={ConciergeBell}
        summary={
          data.appointments_today_count === 0
            ? "No appointments today."
            : `${data.appointments_today_count} appointment${data.appointments_today_count === 1 ? "" : "s"} today · ${data.intake_done_today} already filled in the pre-visit form.`
        }
        actions={[
          { href: "/patients/new", label: "Register patient", icon: UserPlus },
          { href: "/appointments/new", label: "New appointment", icon: CalendarPlus },
          { href: "/settings/registration-qr", label: "Registration QR", icon: QrCode },
        ]}
      />

      <section aria-label="Key numbers" className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard index={0} label="Today's appointments" value={data.appointments_today_count} sub="on the schedule" icon={CalendarCheck} href="/appointments" emphasis />
        <StatCard
          index={1}
          label="Pre-visit form done"
          value={<>{data.intake_done_today}<span className={`text-2xl ${text.muted}`}> of {data.appointments_today_count}</span></>}
          sub={
            <span className="mt-1 block">
              <span className="block h-2 overflow-hidden rounded-full bg-teal-50" aria-hidden="true">
                <span className="block h-full rounded-full bg-teal-500" style={{ width: `${pct}%` }} />
              </span>
            </span>
          }
          icon={ClipboardCheck}
          tone="teal"
        />
        <StatCard index={2} label="Pre-visit forms waiting" value={data.previsit_forms_waiting} sub="to finish registering" icon={FileClock} tone="sky" href="/registrations" />
      </section>

      <Panel title="Today's appointments" icon={ClipboardList} tone="sky" count={data.appointments_today_count} href="/appointments" className="mb-4" index={5}>
        {data.appointments_today.length === 0 ? (
          <ul role="list"><EmptyRow icon={CalendarCheck}>No appointments today.</EmptyRow></ul>
        ) : (
          <ol role="list" className="px-5 py-3">
            {data.appointments_today.map((a) => (
              <li key={a.id} className="relative">
                <Link href={`/appointments/${a.id}`} className="flex items-center gap-4 rounded-xl px-2 py-2.5 transition-colors hover:bg-rose-50/40 focus-visible:bg-rose-50/40 focus-visible:outline-none">
                  <span className="w-20 shrink-0 whitespace-nowrap text-right font-display text-lg text-rose-700">{formatTime(a.scheduled_at)}</span>
                  <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full ring-4 ${a.intake_completed ? "ring-teal-50" : "ring-stone-100"} ${a.intake_completed ? "bg-teal-500" : "bg-stone-300"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-semibold ${text.ink}`}>{a.patient.full_name}</span>
                    <span className={`block text-xs ${text.muted}`}>{humanize(a.appointment_type)}</span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <StatusBadge status={a.status} />
                    {a.intake_completed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-200">
                        <ClipboardCheck size={12} aria-hidden="true" /> Form ✓
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600 ring-1 ring-inset ring-stone-200">
                        <ClipboardX size={12} aria-hidden="true" /> No form yet
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Link
        href="/appointments"
        style={tomorrow.style}
        className={`group flex items-center justify-between gap-3 rounded-2xl border border-[#eadbd3] bg-linear-to-r from-amber-50 to-white px-5 py-4 text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${tomorrow.className}`}
      >
        <span className="flex items-center gap-3">
          <Sunrise size={20} className="text-amber-600" aria-hidden="true" />
          <span className={text.ink}>
            Tomorrow: <span className="font-semibold">{data.appointments_tomorrow_count} appointments</span>
          </span>
        </span>
        <ArrowRight size={16} className="text-rose-600 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </>
  );
}
