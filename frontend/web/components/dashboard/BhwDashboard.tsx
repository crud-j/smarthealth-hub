"use client";

import Link from "next/link";
import {
  CalendarCheck, CalendarX2, ClipboardPen, CreditCard, FileClock, HeartHandshake, MapPin,
  MessageSquareText, MessageSquareWarning, Phone, ScanLine, Syringe, UserPlus, PartyPopper,
} from "lucide-react";
import type { BhwDashboardData, ImmunizationDueRow } from "@/types/dashboard";
import {
  Avatar, Chip, DashboardHeader, EmptyRow, IconBadge, Panel, RowList, StatCard, StatGrid,
  TwoColumns, dueLabel, formatDay, formatTime, humanize, rise, text,
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

function summary(d: BhwDashboardData): string {
  const parts: string[] = [];
  if (d.immunizations_overdue > 0) parts.push(`${d.immunizations_overdue} overdue dose${d.immunizations_overdue === 1 ? "" : "s"}`);
  if (d.missed_appointments_7d > 0) parts.push(`${d.missed_appointments_7d} missed appointment${d.missed_appointments_7d === 1 ? "" : "s"} to follow up`);
  if (d.sms_today_failed > 0) parts.push(`${d.sms_today_failed} failed SMS`);
  return parts.length ? `Today: ${parts.join(", ")}.` : "Nothing urgent today. Here's the week ahead.";
}

export default function BhwDashboard({ data }: { data: BhwDashboardData }) {
  const groups = bySitio(data.immunizations_due);

  return (
    <>
      <DashboardHeader
        firstName={data.first_name}
        today={data.today}
        roleLabel="Barangay Health Worker"
        roleIcon={HeartHandshake}
        summary={summary(data)}
        actions={[
          { href: "/health-cards/verify", label: "Scan card", icon: ScanLine },
          { href: "/patients", label: "Log visit", icon: ClipboardPen },
          { href: "/patients/new", label: "Register patient", icon: UserPlus },
        ]}
      />

      <StatGrid>
        <StatCard
          index={0}
          label="Immunizations due"
          value={data.immunizations_due_7d}
          sub={`next 7 days · ${data.immunizations_overdue} overdue`}
          icon={Syringe}
          href="/immunizations"
          emphasis
        />
        <StatCard index={1} label="Missed appointments" value={data.missed_appointments_7d} sub="last 7 days" icon={CalendarX2} tone="red" href="/appointments" />
        <StatCard
          index={2}
          label="SMS today"
          value={<>{data.sms_today_sent}<span className={`text-2xl ${text.muted}`}> sent</span></>}
          sub={data.sms_today_failed > 0 ? `${data.sms_today_failed} failed, needs a look` : "none failed"}
          icon={data.sms_today_failed > 0 ? MessageSquareWarning : MessageSquareText}
          tone={data.sms_today_failed > 0 ? "amber" : "teal"}
          href="/sms-logs"
        />
        <StatCard index={3} label="Today's appointments" value={data.appointments_today_count} sub="on the schedule" icon={CalendarCheck} tone="sky" href="/appointments" />
      </StatGrid>

      <Panel title="Immunizations due, by sitio/purok" icon={Syringe} count={data.immunizations_due.length} href="/immunizations" className="mb-6" index={5}>
        {groups.length === 0 ? (
          <RowList><EmptyRow icon={PartyPopper}>No immunizations due in the next 7 days.</EmptyRow></RowList>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
            {groups.map(([sitio, rows], gi) => {
              const a = rise(6 + gi);
              const overdue = rows.filter((r) => r.overdue).length;
              return (
                <div key={sitio} style={a.style} className={`rounded-xl border border-[#f1e6e0] bg-[#fdfaf8] ${a.className} ${groups.length === 1 ? "md:col-span-2" : ""}`}>
                  <h3 className="flex items-center gap-2 border-b border-[#f1e6e0] px-4 py-2.5">
                    <MapPin size={16} className="text-rose-500" aria-hidden="true" />
                    <span className={`text-sm font-semibold ${sitio === NO_SITIO ? text.muted : text.ink}`}>{sitio}</span>
                    <Chip tone="slate">{rows.length}</Chip>
                    {overdue > 0 && <Chip tone="red">{overdue} overdue</Chip>}
                  </h3>
                  <ul role="list" className={`divide-y divide-[#f4ebe6] ${groups.length === 1 ? "md:columns-2 md:gap-0 md:divide-y-0" : ""}`}>
                    {rows.map((r) => {
                      const due = dueLabel(r.next_due_date, data.today);
                      return (
                        <li key={r.id} className="break-inside-avoid">
                          <Link
                            href={`/patients/${r.patient.id}/immunizations`}
                            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white focus-visible:bg-white focus-visible:outline-none"
                          >
                            <IconBadge icon={Syringe} tone={due.tone === "red" ? "red" : "teal"} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-sm font-semibold ${text.ink}`}>{r.patient.full_name}</span>
                              <span className={`block text-xs ${text.muted}`}>{r.vaccine_name} · dose {r.dose_number}</span>
                            </span>
                            <Chip tone={due.tone}>{due.text}</Chip>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <TwoColumns>
        <Panel title="Missed appointments to follow up" icon={CalendarX2} tone="red" count={data.missed_appointments_7d} href="/appointments" index={8}>
          <RowList>
            {data.missed_appointments.length === 0 ? (
              <EmptyRow icon={CalendarCheck}>No missed appointments in the last 7 days.</EmptyRow>
            ) : (
              data.missed_appointments.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={a.patient.full_name} />
                  <Link href={`/appointments/${a.id}`} className="min-w-0 flex-1 focus-visible:outline-none">
                    <span className={`block truncate text-sm font-semibold hover:text-rose-700 ${text.ink}`}>{a.patient.full_name}</span>
                    <span className={`block text-xs ${text.muted}`}>{humanize(a.appointment_type)} · missed {formatDay(a.scheduled_at)}</span>
                  </Link>
                  {a.mobile_number && (
                    <a
                      href={`tel:${a.mobile_number}`}
                      aria-label={`Call ${a.patient.full_name}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                    >
                      <Phone size={13} aria-hidden="true" /> <span className="font-mono">{a.mobile_number}</span>
                    </a>
                  )}
                </li>
              ))
            )}
          </RowList>
        </Panel>

        <Panel title="Failed reminder SMS" icon={MessageSquareWarning} tone="amber" count={data.failed_sms.length} href="/sms-logs" linkLabel="SMS logs" index={9}>
          <RowList>
            {data.failed_sms.length === 0 ? (
              <EmptyRow icon={MessageSquareText}>No failed SMS in the last 7 days.</EmptyRow>
            ) : (
              data.failed_sms.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-5 py-3">
                  <IconBadge icon={MessageSquareWarning} tone="amber" size="sm" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className={text.ink}>
                      <span className="font-semibold">{s.patient ? s.patient.full_name : "Unknown patient"}</span>
                      <span className={`text-xs ${text.muted}`}> · {SMS_KIND[s.kind]} · {formatDay(s.created_at)} {formatTime(s.created_at)}</span>
                    </p>
                    {s.reason && <p className="mt-0.5 text-xs text-red-700">{s.reason}</p>}
                  </div>
                  {s.patient && (
                    <Link href={`/patients/${s.patient.id}/edit`} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                      Fix number
                    </Link>
                  )}
                </li>
              ))
            )}
          </RowList>
        </Panel>
      </TwoColumns>

      <section aria-label="More" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard index={10} label="Pre-visit forms waiting" value={data.previsit_forms_waiting} sub="filled in at home" icon={FileClock} tone="sky" href="/registrations" />
        <StatCard index={11} label="Visits I logged" value={data.visits_logged_by_me_week} sub="this week" icon={ClipboardPen} tone="teal" />
        <StatCard index={12} label="Without an active card" value={data.patients_without_active_card} sub="patients" icon={CreditCard} tone="amber" href="/health-cards" />
      </section>
    </>
  );
}
