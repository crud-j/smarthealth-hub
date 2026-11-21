"use client";

import Link from "next/link";
import type { AdminStaffDashboardData } from "@/types/dashboard";
import {
  DashboardHeader, EmptyRow, Panel, RowList, StatCard, StatusBadge, formatTime, humanize,
} from "./shared";

export default function AdminStaffDashboard({ data }: { data: AdminStaffDashboardData }) {
  return (
    <>
      <DashboardHeader
        firstName={data.first_name}
        today={data.today}
        roleLabel="Front desk"
        actions={[
          { href: "/patients/new", label: "Register patient" },
          { href: "/appointments/new", label: "New appointment" },
          { href: "/settings/registration-qr", label: "Registration QR" },
        ]}
      />

      <section aria-label="Key numbers" className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Today's appointments" value={data.appointments_today_count} href="/appointments" emphasis />
        <StatCard
          label="Pre-visit form done"
          value={`${data.intake_done_today} of ${data.appointments_today_count}`}
        />
        <StatCard label="Pre-visit forms waiting" value={data.previsit_forms_waiting} href="/registrations" />
      </section>

      <Panel title="Today's appointments" href="/appointments" className="mb-4">
        <RowList>
          {data.appointments_today.length === 0 ? (
            <EmptyRow>No appointments today.</EmptyRow>
          ) : (
            data.appointments_today.map((a) => (
              <li key={a.id}>
                <Link href={`/appointments/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                  <span className="min-w-0 text-sm">
                    <span className="font-mono text-slate-500">{formatTime(a.scheduled_at)}</span>{" "}
                    <span className="font-medium text-slate-900">{a.patient.full_name}</span>{" "}
                    <span className="text-slate-500">· {humanize(a.appointment_type)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    <span className={`text-xs font-medium ${a.intake_completed ? "text-green-700" : "text-slate-400"}`}>
                      {a.intake_completed ? "Form ✓" : "No form yet"}
                    </span>
                  </span>
                </Link>
              </li>
            ))
          )}
        </RowList>
      </Panel>

      <Link href="/appointments" className="block rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-700 shadow-sm hover:border-slate-300">
        Tomorrow: {data.appointments_tomorrow_count} appointments →
      </Link>
    </>
  );
}
