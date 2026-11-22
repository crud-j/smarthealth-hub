"use client";

import Link from "next/link";
import { CalendarCheck, ClipboardPen } from "lucide-react";
import { canStartVisit, startVisitHref } from "@/lib/start-visit";
import type { AppointmentRow } from "@/types/dashboard";
import { EmptyRow, Panel, RowList, StatusBadge, formatTime, humanize, text } from "./shared";

/**
 * Today's appointments, earliest first. Each row opens the appointment; open
 * ones (pending / confirmed / missed) also get "Start visit", which opens
 * Add Visit already filled in from the appointment.
 */
export function TodayAppointmentsPanel({
  rows,
  count,
  today,
  role,
  index,
  className,
}: {
  rows: AppointmentRow[];
  count: number;
  /** Manila date the dashboard is for (YYYY-MM-DD). */
  today: string;
  role: string;
  index: number;
  className?: string;
}) {
  return (
    <Panel title="Today's appointments" icon={CalendarCheck} tone="sky" count={count} href="/appointments" index={index} className={className}>
      <RowList>
        {rows.length === 0 ? (
          <EmptyRow icon={CalendarCheck}>No appointments today.</EmptyRow>
        ) : (
          rows.map((a) => (
            <li key={a.id} className="flex items-center gap-3 pr-4 transition-colors hover:bg-rose-50/40">
              <Link
                href={`/appointments/${a.id}`}
                className="flex min-w-0 flex-1 items-center gap-4 py-3 pl-5 focus-visible:bg-rose-50/40 focus-visible:outline-none"
              >
                <span className="w-20 shrink-0 whitespace-nowrap font-display text-lg text-rose-700">{formatTime(a.scheduled_at)}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-semibold ${text.ink}`}>{a.patient.full_name}</span>
                  <span className={`block text-xs ${text.muted}`}>{humanize(a.appointment_type)}</span>
                </span>
                <StatusBadge status={a.status} />
              </Link>
              {canStartVisit(role, { status: a.status, scheduledAt: a.scheduled_at }, today) && (
                <Link
                  href={startVisitHref(a.patient.id)}
                  aria-label={`Start visit for ${a.patient.full_name}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
                >
                  <ClipboardPen size={13} aria-hidden="true" /> Start visit
                </Link>
              )}
            </li>
          ))
        )}
      </RowList>
      {count > rows.length && (
        <p className={`border-t border-[#f4ebe6] px-5 py-2 text-xs ${text.muted}`}>
          Showing the first {rows.length} of {count}.
        </p>
      )}
    </Panel>
  );
}
