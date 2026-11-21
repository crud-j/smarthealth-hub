"use client";

import Link from "next/link";
import type { BhwDashboardData, ImmunizationDueRow } from "@/types/dashboard";
import {
  DashboardHeader, EmptyRow, Panel, RowList, StatCard, StatGrid, TwoColumns,
  formatDay, formatTime, humanize,
} from "./shared";

const NO_SITIO = "No sitio/purok recorded";

/** Group doses by sitio/purok, keeping the server's order (overdue first). */
function bySitio(rows: ImmunizationDueRow[]): [string, ImmunizationDueRow[]][] {
  const groups = new Map<string, ImmunizationDueRow[]>();
  for (const row of rows) {
    const key = row.sitio_purok?.trim() || NO_SITIO;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()];
}

const SMS_KIND: Record<string, string> = {
  appointment: "Appointment reminder",
  immunization: "Immunization reminder",
  other: "SMS",
};

export default function BhwDashboard({ data }: { data: BhwDashboardData }) {
  return (
    <>
      <DashboardHeader
        firstName={data.first_name}
        today={data.today}
        roleLabel="Barangay Health Worker"
        actions={[
          { href: "/health-cards/verify", label: "Scan card" },
          { href: "/patients", label: "Log visit" },
          { href: "/patients/new", label: "Register patient" },
        ]}
      />

      <StatGrid>
        <StatCard
          label="Immunizations due"
          value={data.immunizations_due_7d}
          sub={`next 7 days · ${data.immunizations_overdue} overdue`}
          href="/immunizations"
          emphasis
        />
        <StatCard label="Missed appointments" value={data.missed_appointments_7d} sub="last 7 days" href="/appointments" />
        <StatCard
          label="SMS today"
          value={`${data.sms_today_sent} sent`}
          sub={`${data.sms_today_failed} failed`}
          href="/sms-logs"
          tone={data.sms_today_failed > 0 ? "warning" : "default"}
        />
        <StatCard label="Today's appointments" value={data.appointments_today_count} href="/appointments" />
      </StatGrid>

      <Panel title="Immunizations due, by sitio/purok" href="/immunizations" className="mb-6">
        {data.immunizations_due.length === 0 ? (
          <RowList><EmptyRow>No immunizations due in the next 7 days.</EmptyRow></RowList>
        ) : (
          <div className="divide-y divide-slate-100">
            {bySitio(data.immunizations_due).map(([sitio, rows]) => (
              <div key={sitio} className="px-5 py-3">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{sitio}</h3>
                <ul role="list" className="space-y-1">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <Link href={`/patients/${r.patient.id}/immunizations`} className="flex flex-wrap items-center gap-x-2 text-sm hover:underline focus-visible:underline focus-visible:outline-none">
                        <span className="font-medium text-slate-900">{r.patient.full_name}</span>
                        <span className="text-slate-500">· {r.vaccine_name} dose {r.dose_number} ·</span>
                        {r.overdue ? (
                          <span className="rounded bg-red-50 px-1.5 text-xs font-semibold text-red-700">Overdue since {formatDay(r.next_due_date)}</span>
                        ) : (
                          <span className="text-slate-600">due {formatDay(r.next_due_date)}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <TwoColumns>
        <Panel title="Missed appointments to follow up" href="/appointments">
          <RowList>
            {data.missed_appointments.length === 0 ? (
              <EmptyRow>No missed appointments in the last 7 days.</EmptyRow>
            ) : (
              data.missed_appointments.map((a) => (
                <li key={a.id}>
                  <Link href={`/appointments/${a.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium text-slate-900">{a.patient.full_name}</span>
                      <span className="block text-slate-500">{humanize(a.appointment_type)} · {formatDay(a.scheduled_at)}</span>
                    </span>
                    {a.mobile_number && <span className="shrink-0 font-mono text-sm text-slate-600">{a.mobile_number}</span>}
                  </Link>
                </li>
              ))
            )}
          </RowList>
        </Panel>

        <Panel title="Failed reminder SMS" href="/sms-logs" linkLabel="SMS logs">
          <RowList>
            {data.failed_sms.length === 0 ? (
              <EmptyRow>No failed SMS in the last 7 days.</EmptyRow>
            ) : (
              data.failed_sms.map((s) => (
                <li key={s.id} className="px-5 py-3 text-sm">
                  <p className="text-slate-900">
                    {s.patient ? (
                      <Link href={`/patients/${s.patient.id}/edit`} className="font-medium hover:underline">{s.patient.full_name}</Link>
                    ) : (
                      "Unknown patient"
                    )}
                    <span className="text-slate-500"> · {SMS_KIND[s.kind]} · {formatDay(s.created_at)} {formatTime(s.created_at)}</span>
                  </p>
                  {s.reason && <p className="text-red-700">{s.reason}</p>}
                </li>
              ))
            )}
          </RowList>
        </Panel>
      </TwoColumns>

      <section aria-label="More" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Pre-visit forms waiting" value={data.previsit_forms_waiting} href="/registrations" />
        <StatCard label="Visits I logged this week" value={data.visits_logged_by_me_week} />
        <StatCard label="Patients without an active card" value={data.patients_without_active_card} href="/health-cards" />
      </section>
    </>
  );
}
