"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDashboardOverview } from "@/hooks/useAnalytics";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { RecentPatientRow, UpcomingAppointmentRow } from "@/types/analytics";

// ---------------------------------------------------------------------------
// Backend Logic (Preserved)
// ---------------------------------------------------------------------------

interface PatientSummaryApiRow {
  id: string;
  patient_code: string;
  full_name: string;
  age: number;
  sex: "male" | "female";
  created_at: string | null;
}

interface PaginatedPatientsApiResponse {
  items: PatientSummaryApiRow[];
  total: number;
  page: number;
  page_size: number;
}

interface AppointmentApiRow {
  id: string;
  patient_code: string;
  full_name: string;
  appointment_type: string;
  scheduled_at: string;
  status: string;
}

interface PaginatedAppointmentsApiResponse {
  items: AppointmentApiRow[];
  total: number;
  page: number;
  page_size: number;
}

function usePendingRegistrationsCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    void (async () => {
      const [drafts, apps] = await Promise.allSettled([
        apiFetch<{ token: string; has_draft: boolean }[]>("/intake/pending"),
        apiFetch<{ total: number }>("/intake-applications?status=pending&page_size=1"),
      ]);
      const draftCount = drafts.status === "fulfilled" ? drafts.value.filter((t) => t.has_draft).length : 0;
      const appCount = apps.status === "fulfilled" ? (apps.value as { total: number }).total : 0;
      setCount(draftCount + appCount);
    })();
  }, []);
  return count;
}

function usePanelData() {
  const [recentPatients, setRecentPatients] = useState<RecentPatientRow[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadPanels() {
      setLoading(true);
      const [patientsResult, appointmentsResult] = await Promise.allSettled([
        apiFetch<PaginatedPatientsApiResponse>("/patients?sort=created_at&page_size=5"),
        apiFetch<PaginatedAppointmentsApiResponse>("/appointments?status=pending&sort=scheduled_at&page_size=5"),
      ]);

      if (cancelled) return;

      if (patientsResult.status === "fulfilled") {
        setRecentPatients(
          patientsResult.value.items.map((p) => ({
            id: p.id,
            patientCode: p.patient_code,
            fullName: p.full_name,
            age: p.age,
            sex: p.sex,
            createdAt: p.created_at ?? "",
          }))
        );
      } else {
        console.error(
          "[dashboard] failed to load recent patients:",
          patientsResult.reason instanceof ApiError
            ? patientsResult.reason.message
            : patientsResult.reason
        );
      }

      if (appointmentsResult.status === "fulfilled") {
        setUpcomingAppointments(
          appointmentsResult.value.items.map((a) => ({
            id: a.id,
            patientName: a.full_name,
            patientCode: a.patient_code,
            appointmentType: a.appointment_type,
            scheduledAt: a.scheduled_at,
            status: a.status,
          }))
        );
      } else {
        console.error(
          "[dashboard] failed to load upcoming appointments:",
          appointmentsResult.reason instanceof ApiError
            ? appointmentsResult.reason.message
            : appointmentsResult.reason
        );
      }

      if (!cancelled) setLoading(false);
    }

    void loadPanels();
    return () => { cancelled = true; };
  }, []);

  return { recentPatients, upcomingAppointments, loading };
}

// ---------------------------------------------------------------------------
// UI Components
// ---------------------------------------------------------------------------

const APPT_STATUS_CLASSES: Record<string, string> = {
  pending:   "bg-yellow-50 text-yellow-800 ring-yellow-600/20",
  confirmed: "bg-green-50 text-green-800 ring-green-600/20",
  completed: "bg-slate-50 text-slate-800 ring-slate-600/20",
  missed:    "bg-red-50 text-red-800 ring-red-600/20",
  cancelled: "bg-slate-50 text-slate-500 ring-slate-500/20",
};

function StatusBadge({ status }: { status: string }) {
  const badgeClass = APPT_STATUS_CLASSES[status] ?? APPT_STATUS_CLASSES.pending;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${badgeClass}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Metric Card
// ---------------------------------------------------------------------------

type CardVariant = "primary" | "default" | "rose-tint";

interface MetricCardProps {
  title: string;
  value: number | null;
  icon: React.ReactNode;
  variant?: CardVariant;
  href?: string;
  loading?: boolean;
}

function MetricCard({ title, value, icon, variant = "default", href, loading }: MetricCardProps) {
  const isPrimary = variant === "primary";

  const baseStyles = "relative flex h-full flex-col overflow-hidden rounded-xl p-6 transition-all shadow-sm focus-within:ring-2 focus-within:ring-rose-500 focus-within:ring-offset-2";
  
  const variants = {
    primary: "bg-rose-600 text-white hover:bg-rose-700",
    default: "bg-white text-slate-900 border border-slate-200 hover:border-slate-300",
    "rose-tint": "bg-rose-50 text-rose-900 border border-rose-100 hover:border-rose-200",
  };

  const labelVariants = {
    primary: "text-rose-100",
    default: "text-slate-500",
    "rose-tint": "text-rose-600",
  };

  const inner = (
    <>
      <h3 className={`text-sm font-medium ${labelVariants[variant]}`}>
        {title}
      </h3>
      
      {loading ? (
        <div 
          className="mt-4 h-10 w-24 animate-pulse rounded bg-current opacity-20" 
          aria-hidden="true" 
        />
      ) : (
        <p className={`mt-2 text-3xl font-semibold tracking-tight ${isPrimary ? 'text-4xl' : ''}`}>
          {value?.toLocaleString() ?? "—"}
        </p>
      )}

      {isPrimary && href && !loading && (
        <div className="mt-auto pt-4 flex items-center gap-1.5 text-sm font-medium text-rose-100">
          View all records <IconArrow />
        </div>
      )}

      <div 
        className={`absolute bottom-4 right-4 pointer-events-none transition-transform group-hover:scale-110 ${isPrimary ? 'text-rose-400 opacity-30' : 'text-slate-300 opacity-50'}`}
        aria-hidden="true"
      >
        {icon}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`group block focus-visible:outline-none ${baseStyles} ${variants[variant]}`}>
        {inner}
      </Link>
    );
  }

  return <div className={`${baseStyles} ${variants[variant]}`}>{inner}</div>;
}

// ---------------------------------------------------------------------------
// Page Layout
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data, loading: overviewLoading, error } = useDashboardOverview();
  const { recentPatients, upcomingAppointments, loading: panelsLoading } = usePanelData();
  const pendingRegistrations = usePendingRegistrationsCount();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">
          Real-time health center analytics and overview.
        </p>
      </header>

      {/* Error State */}
      {error && (
        <div role="alert" className="mb-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          Could not load dashboard data: {error.message}
        </div>
      )}

      {/* Metric Grid */}
      <section className="mb-8 grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4" aria-label="Key Metrics">
        <div className="sm:col-span-2 lg:row-span-2">
          <MetricCard
            title="Total Active Patients"
            value={data?.totalActivePatients ?? null}
            icon={<IconPatients size={80} />}
            variant="primary"
            href="/patients"
            loading={overviewLoading}
          />
        </div>
        
        <MetricCard
          title="Visits This Week"
          value={data?.visitsThisWeek ?? null}
          icon={<IconVisits size={48} />}
          variant="default"
          loading={overviewLoading}
        />
        
        <MetricCard
          title="Upcoming Appointments"
          value={data?.upcomingAppointments ?? null}
          icon={<IconCalendar size={48} />}
          variant="default"
          href="/appointments"
          loading={overviewLoading}
        />
        
        <MetricCard
          title="Immunizations Due"
          value={data?.immunizationsDue ?? null}
          icon={<IconSyringe size={48} />}
          variant="rose-tint"
          href="/immunizations"
          loading={overviewLoading}
        />

        <MetricCard
          title="Pending Registrations"
          value={pendingRegistrations}
          icon={<IconInbox size={48} />}
          variant="rose-tint"
          href="/registrations"
          loading={pendingRegistrations === null}
        />
      </section>

      {/* Data Panels */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        
        {/* Recent Patients Panel */}
        <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Recently Registered</h2>
            <Link 
              href="/patients" 
              className="text-sm font-medium text-rose-600 hover:text-rose-500 focus-visible:outline-none focus-visible:underline"
            >
              View all
            </Link>
          </header>

          <ul role="list" className="divide-y divide-slate-100" aria-busy={panelsLoading}>
            {panelsLoading ? (
              <PanelSkeleton />
            ) : recentPatients.length === 0 ? (
              <EmptyState message="No patients registered yet." />
            ) : (
              recentPatients.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/patients/${p.id}`}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-sm font-semibold text-rose-600 ring-1 ring-inset ring-rose-600/20" aria-hidden="true">
                      {(p.fullName || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{p.fullName || p.patientCode}</p>
                      <p className="truncate text-sm text-slate-500 capitalize">{p.sex} • {p.age} yrs</p>
                    </div>
                    <div className="text-sm text-slate-400 font-mono">{p.patientCode}</div>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* Upcoming Appointments Panel */}
        <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Upcoming Appointments</h2>
            <Link 
              href="/appointments" 
              className="text-sm font-medium text-rose-600 hover:text-rose-500 focus-visible:outline-none focus-visible:underline"
            >
              View all
            </Link>
          </header>

          <ul role="list" className="divide-y divide-slate-100" aria-busy={panelsLoading}>
            {panelsLoading ? (
              <PanelSkeleton />
            ) : upcomingAppointments.length === 0 ? (
              <EmptyState message="No upcoming appointments." />
            ) : (
              upcomingAppointments.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/appointments/${a.id}`}
                    className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{a.patientName || a.patientCode}</p>
                      <p className="truncate text-sm text-slate-500">
                        {a.appointmentType.replace("_", " ")} • {" "}
                        <time dateTime={a.scheduledAt}>
                          {new Date(a.scheduledAt).toLocaleString("en-PH", {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </time>
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>

      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function PanelSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center gap-4 px-6 py-4">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <li className="px-6 py-12 text-center text-sm text-slate-500">
      {message}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Icons (Preserved SVGs)
// ---------------------------------------------------------------------------

function IconPatients({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconVisits({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
function IconCalendar({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconSyringe({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 2l4 4" />
      <path d="m17 7 3-3" />
      <path d="M19 9 8.7 19.3a1 1 0 0 1-1.4 0l-2.6-2.6a1 1 0 0 1 0-1.4L15 5" />
      <path d="m9 11 4 4" />
      <path d="m5 19-3 3" />
      <path d="m14 4 6 6" />
    </svg>
  );
}
function IconInbox({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}