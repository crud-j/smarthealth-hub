"use client";

/**
 * Dashboard page — Phase 5.
 *
 * Client Component: fetches analytics overview via useDashboardOverview().
 * (Could be SSR but requires cookie forwarding setup; client-side is simpler
 * and acceptable here since this is not a crawler-indexed page.)
 *
 * Shows:
 *  - 4 summary metric cards (active patients, visits this week,
 *    upcoming appointments, immunizations due)
 *  - Recent patients table (last 5 registered)
 *  - Upcoming appointments table (next 5)
 */

import Link from "next/link";
import { useDashboardOverview } from "@/hooks/useAnalytics";

// ---------------------------------------------------------------------------
// Summary card component
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  title: string;
  value: number | null;
  icon: React.ReactNode;
  color: "teal" | "blue" | "amber" | "green";
  href?: string;
  loading?: boolean;
}

const COLOR_MAP = {
  teal: { bg: "bg-teal-50", icon: "bg-teal-100 text-teal-600", value: "text-teal-700" },
  blue: { bg: "bg-blue-50", icon: "bg-blue-100 text-blue-600", value: "text-blue-700" },
  amber: { bg: "bg-amber-50", icon: "bg-amber-100 text-amber-600", value: "text-amber-700" },
  green: { bg: "bg-green-50", icon: "bg-green-100 text-green-600", value: "text-green-700" },
};

function SummaryCard({ title, value, icon, color, href, loading }: SummaryCardProps) {
  const c = COLOR_MAP[color];
  const inner = (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
          {loading ? (
            <div className="mt-2 h-9 w-20 animate-pulse rounded bg-slate-200" />
          ) : (
            <p className={`mt-1 text-3xl font-bold ${c.value}`}>
              {value?.toLocaleString() ?? "—"}
            </p>
          )}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${c.icon}`} aria-hidden="true">
          {icon}
        </div>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500">
      {inner}
    </Link>
  ) : (
    inner
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconPatients() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconVisits() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconSyringe() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2l4 4" /><path d="m17 7 3-3" />
      <path d="M19 9 8.7 19.3a1 1 0 0 1-1.4 0l-2.6-2.6a1 1 0 0 1 0-1.4L15 5" />
      <path d="m9 11 4 4" /><path d="m5 19-3 3" /><path d="m14 4 6 6" />
    </svg>
  );
}

const APPT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-teal-100 text-teal-700",
  completed: "bg-green-100 text-green-700",
  missed: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data, loading, error } = useDashboardOverview();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Real-time health center analytics and overview
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          Could not load dashboard data: {error.message}
        </div>
      )}

      {/* Summary cards grid */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total Active Patients"
          value={data?.totalActivePatients ?? null}
          icon={<IconPatients />}
          color="teal"
          href="/patients"
          loading={loading}
        />
        <SummaryCard
          title="Visits This Week"
          value={data?.visitsThisWeek ?? null}
          icon={<IconVisits />}
          color="blue"
          loading={loading}
        />
        <SummaryCard
          title="Upcoming Appointments"
          value={data?.upcomingAppointments ?? null}
          icon={<IconCalendar />}
          color="amber"
          href="/appointments"
          loading={loading}
        />
        <SummaryCard
          title="Immunizations Due"
          value={data?.immunizationsDue ?? null}
          icon={<IconSyringe />}
          color="green"
          href="/immunizations"
          loading={loading}
        />
      </div>

      {/* Lower panels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent patients */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Recently Registered Patients</h2>
            <Link href="/patients" className="text-xs text-teal-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-36 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
                  </div>
                </div>
              ))}
            {!loading && (data?.recentPatients ?? []).length === 0 && (
              <p className="px-5 py-6 text-sm text-slate-400">No patients registered yet.</p>
            )}
            {!loading &&
              (data?.recentPatients ?? []).map((p) => (
                <Link
                  key={p.id}
                  href={`/patients/${p.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
                >
                  {/* Avatar initials */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700" aria-hidden="true">
                    {p.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{p.fullName}</p>
                    <p className="text-xs text-slate-400">
                      {p.sex === "male" ? "Male" : "Female"} · {p.age} yrs
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-xs text-slate-400">{p.patientCode}</p>
                </Link>
              ))}
          </div>
        </div>

        {/* Upcoming appointments */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Upcoming Appointments</h2>
            <Link href="/appointments" className="text-xs text-teal-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-40 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
                  </div>
                  <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
                </div>
              ))}
            {!loading && (data?.upcomingAppointmentsList ?? []).length === 0 && (
              <p className="px-5 py-6 text-sm text-slate-400">No upcoming appointments.</p>
            )}
            {!loading &&
              (data?.upcomingAppointmentsList ?? []).map((a) => (
                <Link
                  key={a.id}
                  href={`/appointments/${a.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{a.patientName}</p>
                    <p className="text-xs text-slate-400">
                      {a.appointmentType.replace("_", " ")} ·{" "}
                      {new Date(a.scheduledAt).toLocaleString("en-PH", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${APPT_STATUS_COLORS[a.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                  </span>
                </Link>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
