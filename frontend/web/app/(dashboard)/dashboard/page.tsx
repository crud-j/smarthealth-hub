"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDashboardOverview } from "@/hooks/useAnalytics";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { RecentPatientRow, UpcomingAppointmentRow } from "@/types/analytics";

// ---------------------------------------------------------------------------
// Panel data — parallel fetch, same logic as before
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

function usePanelData() {
  const [recentPatients, setRecentPatients] = useState<RecentPatientRow[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<
    UpcomingAppointmentRow[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadPanels() {
      setLoading(true);
      const [patientsResult, appointmentsResult] = await Promise.allSettled([
        apiFetch<PaginatedPatientsApiResponse>(
          "/patients?sort=created_at&page_size=5"
        ),
        apiFetch<PaginatedAppointmentsApiResponse>(
          "/appointments?status=pending&sort=scheduled_at&page_size=5"
        ),
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
    return () => {
      cancelled = true;
    };
  }, []);

  return { recentPatients, upcomingAppointments, loading };
}

// ---------------------------------------------------------------------------
// Icons — accept size prop for watermark variants
// ---------------------------------------------------------------------------

function IconPatients({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconVisits({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
function IconCalendar({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconSyringe({ size = 22 }: { size?: number }) {
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
function IconArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Bento metric card
// ---------------------------------------------------------------------------

type CardVariant = "primary" | "default" | "rose-tint";

interface SummaryCardProps {
  title: string;
  value: number | null;
  watermark: React.ReactNode;
  variant?: CardVariant;
  href?: string;
  loading?: boolean;
}

const CARD_STYLES: Record<
  CardVariant,
  { bg: string; border: string; shadow: string; labelColor: string; valueColor: string; skeletonBg: string; watermarkColor: string; watermarkOpacity: number }
> = {
  primary: {
    bg: "linear-gradient(138deg, #b5343e 0%, #c94060 42%, #da6e7a 72%, #edaab2 100%)",
    border: "none",
    shadow: "0 12px 40px rgba(181,52,62,0.4), 0 0 0 1px rgba(181,52,62,0.15)",
    labelColor: "rgba(255,255,255,0.65)",
    valueColor: "#ffffff",
    skeletonBg: "rgba(255,255,255,0.18)",
    watermarkColor: "#ffffff",
    watermarkOpacity: 0.13,
  },
  default: {
    bg: "#fdf7f3",
    border: "1px solid #e5d4cc",
    shadow: "0 2px 10px rgba(160,80,80,0.07)",
    labelColor: "#9b6e6e",
    valueColor: "#1a0808",
    skeletonBg: "#e8d5cc",
    watermarkColor: "#c08080",
    watermarkOpacity: 0.09,
  },
  "rose-tint": {
    bg: "linear-gradient(138deg, #fdeef0 0%, #fdf7f3 100%)",
    border: "1px solid #e5cfd0",
    shadow: "0 2px 10px rgba(160,80,80,0.07)",
    labelColor: "#9b6e6e",
    valueColor: "#1a0808",
    skeletonBg: "#e8d5cc",
    watermarkColor: "#c08080",
    watermarkOpacity: 0.09,
  },
};

function SummaryCard({
  title,
  value,
  watermark,
  variant = "default",
  href,
  loading,
}: SummaryCardProps) {
  const s = CARD_STYLES[variant];
  const isPrimary = variant === "primary";

  const inner = (
    <div
      className="relative h-full overflow-hidden rounded-2xl p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
      style={{
        background: s.bg,
        border: s.border,
        boxShadow: s.shadow,
      }}
    >
      {/* Dot texture for primary gradient card */}
      {isPrimary && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.55) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            opacity: 0.07,
          }}
          aria-hidden="true"
        />
      )}

      {/* Metric label */}
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.2em]"
        style={{ color: s.labelColor }}
      >
        {title}
      </p>

      {/* Metric value */}
      {loading ? (
        <div
          className="mt-4 h-10 w-28 animate-pulse rounded-lg"
          style={{ background: s.skeletonBg }}
        />
      ) : (
        <p
          className={`mt-3 leading-none tabular-nums ${isPrimary ? "text-6xl" : "text-4xl"}`}
          style={{
            color: s.valueColor,
            fontFamily: "var(--font-dm-serif, Georgia, serif)",
            fontWeight: 400,
            letterSpacing: "-0.02em",
          }}
        >
          {value?.toLocaleString() ?? "—"}
        </p>
      )}

      {/* Link hint on primary */}
      {isPrimary && href && !loading && (
        <div className="mt-4 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.75)" }}>
          <span className="text-xs font-medium">View patients</span>
          <IconArrow />
        </div>
      )}

      {/* Watermark icon */}
      <div
        className="pointer-events-none absolute bottom-4 right-4"
        style={{ color: s.watermarkColor, opacity: s.watermarkOpacity }}
        aria-hidden="true"
      >
        {watermark}
      </div>
    </div>
  );

  return href ? (
    <Link
      href={href}
      className="block h-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c94060]"
    >
      {inner}
    </Link>
  ) : (
    inner
  );
}

// ---------------------------------------------------------------------------
// Appointment status badges
// ---------------------------------------------------------------------------

const APPT_STATUS_CLASSES: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-800 border border-amber-200",
  confirmed: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  completed: "bg-stone-100 text-stone-600 border border-stone-200",
  missed:    "bg-red-100 text-red-700 border border-red-200",
  cancelled: "bg-stone-50 text-stone-400 border border-stone-200",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data, loading, error } = useDashboardOverview();
  const { recentPatients, upcomingAppointments, loading: panelsLoading } =
    usePanelData();

  return (
    <div>
      {/* Page heading */}
      <div className="mb-6">
        <h1
          className="text-3xl leading-tight"
          style={{
            color: "#1a0808",
            fontFamily: "var(--font-dm-serif, Georgia, serif)",
            fontWeight: 400,
          }}
        >
          Dashboard
        </h1>
        <p className="mt-1 text-sm font-medium" style={{ color: "#7a5252" }}>
          Real-time health center analytics and overview
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="mb-6 rounded-xl border p-4 text-sm font-medium"
          style={{
            background: "#fef2f2",
            border: "1px solid #fcc",
            color: "#b91c1c",
          }}
        >
          Could not load dashboard data: {error.message}
        </div>
      )}

      {/* ── Bento metric grid ─────────────────────────────────────────── */}
      {/*
       * Desktop (lg): 4-col grid, primary card is col-span-2 row-span-2.
       *   [Primary 2×2] [Visits 1×1] [Appts 1×1]
       *                 [Immunizations 2×1         ]
       *
       * Tablet (sm): 2-col grid, primary spans full width.
       *   [Primary 2×1]
       *   [Visits] [Appts]
       *   [Immunizations 2×1]
       *
       * Mobile: single column stack.
       */}
      <div className="mb-5 grid auto-rows-[minmax(140px,auto)] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Primary: Active Patients — gradient, 2×2 on desktop */}
        <div className="sm:col-span-2 lg:col-span-2 lg:row-span-2">
          <SummaryCard
            title="Total Active Patients"
            value={data?.totalActivePatients ?? null}
            watermark={<IconPatients size={96} />}
            variant="primary"
            href="/patients"
            loading={loading}
          />
        </div>

        {/* Visits This Week */}
        <div className="lg:col-span-1">
          <SummaryCard
            title="Visits This Week"
            value={data?.visitsThisWeek ?? null}
            watermark={<IconVisits size={72} />}
            variant="default"
            loading={loading}
          />
        </div>

        {/* Upcoming Appointments */}
        <div className="lg:col-span-1">
          <SummaryCard
            title="Upcoming Appointments"
            value={data?.upcomingAppointments ?? null}
            watermark={<IconCalendar size={72} />}
            variant="default"
            href="/appointments"
            loading={loading}
          />
        </div>

        {/* Immunizations Due — spans 2 cols on desktop (fills the 2nd row beside primary) */}
        <div className="sm:col-span-2 lg:col-span-2">
          <SummaryCard
            title="Immunizations Due"
            value={data?.immunizationsDue ?? null}
            watermark={<IconSyringe size={72} />}
            variant="rose-tint"
            href="/immunizations"
            loading={loading}
          />
        </div>
      </div>

      {/* ── Data panels ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent Patients */}
        <div
          className="overflow-hidden rounded-2xl"
          style={{
            background: "#ffffff",
            border: "1px solid #e5d4cc",
            boxShadow: "0 2px 10px rgba(160,80,80,0.06)",
          }}
        >
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{
              background: "linear-gradient(135deg, #fdf0eb 0%, #ffffff 100%)",
              borderBottom: "1px solid #edd9d0",
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="inline-block h-4 w-1 rounded-full"
                style={{ background: "linear-gradient(180deg, #b5343e, #e07070)" }}
                aria-hidden="true"
              />
              <h2 className="text-sm font-bold" style={{ color: "#1a0808" }}>
                Recently Registered Patients
              </h2>
            </div>
            <Link
              href="/patients"
              className="flex items-center gap-1 text-xs font-semibold transition-opacity duration-150 hover:opacity-70"
              style={{ color: "#c94040" }}
            >
              View all <IconArrow />
            </Link>
          </div>

          {/* Patient rows */}
          <div className="divide-y" style={{ borderColor: "#f0e4dd" }}>
            {panelsLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <div
                    className="h-9 w-9 animate-pulse rounded-full"
                    style={{ background: "#edd9d0" }}
                  />
                  <div className="flex-1 space-y-2">
                    <div
                      className="h-3.5 w-36 animate-pulse rounded"
                      style={{ background: "#edd9d0" }}
                    />
                    <div
                      className="h-3 w-20 animate-pulse rounded"
                      style={{ background: "#edd9d0" }}
                    />
                  </div>
                </div>
              ))}

            {!panelsLoading && recentPatients.length === 0 && (
              <p className="px-5 py-6 text-sm font-medium" style={{ color: "#9b6e6e" }}>
                No patients registered yet.
              </p>
            )}

            {!panelsLoading &&
              recentPatients.map((p) => (
                <Link
                  key={p.id}
                  href={`/patients/${p.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors duration-150"
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLAnchorElement).style.background = "#fdf5f0")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLAnchorElement).style.background = "transparent")
                  }
                >
                  {/* Initial avatar */}
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      background: "rgba(181,52,62,0.1)",
                      color: "#b5343e",
                      border: "1.5px solid rgba(181,52,62,0.18)",
                    }}
                    aria-hidden="true"
                  >
                    {(p.fullName || "?").charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: "#1a0808" }}>
                      {p.fullName || `${p.patientCode}`}
                    </p>
                    <p className="text-xs font-medium" style={{ color: "#9b6e6e" }}>
                      {p.sex === "male" ? "Male" : "Female"} · {p.age} yrs
                    </p>
                  </div>

                  <span
                    className="shrink-0 font-mono text-xs"
                    style={{ color: "#b5343e", opacity: 0.7 }}
                  >
                    {p.patientCode}
                  </span>
                </Link>
              ))}
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div
          className="overflow-hidden rounded-2xl"
          style={{
            background: "#ffffff",
            border: "1px solid #e5d4cc",
            boxShadow: "0 2px 10px rgba(160,80,80,0.06)",
          }}
        >
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{
              background: "linear-gradient(135deg, #fdf0eb 0%, #ffffff 100%)",
              borderBottom: "1px solid #edd9d0",
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="inline-block h-4 w-1 rounded-full"
                style={{ background: "linear-gradient(180deg, #b5343e, #e07070)" }}
                aria-hidden="true"
              />
              <h2 className="text-sm font-bold" style={{ color: "#1a0808" }}>
                Upcoming Appointments
              </h2>
            </div>
            <Link
              href="/appointments"
              className="flex items-center gap-1 text-xs font-semibold transition-opacity duration-150 hover:opacity-70"
              style={{ color: "#c94040" }}
            >
              View all <IconArrow />
            </Link>
          </div>

          {/* Appointment rows */}
          <div className="divide-y" style={{ borderColor: "#f0e4dd" }}>
            {panelsLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 space-y-2">
                    <div
                      className="h-3.5 w-40 animate-pulse rounded"
                      style={{ background: "#edd9d0" }}
                    />
                    <div
                      className="h-3 w-28 animate-pulse rounded"
                      style={{ background: "#edd9d0" }}
                    />
                  </div>
                  <div
                    className="h-5 w-20 animate-pulse rounded-full"
                    style={{ background: "#edd9d0" }}
                  />
                </div>
              ))}

            {!panelsLoading && upcomingAppointments.length === 0 && (
              <p className="px-5 py-6 text-sm font-medium" style={{ color: "#9b6e6e" }}>
                No upcoming appointments.
              </p>
            )}

            {!panelsLoading &&
              upcomingAppointments.map((a) => (
                <Link
                  key={a.id}
                  href={`/appointments/${a.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition-colors duration-150"
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLAnchorElement).style.background = "#fdf5f0")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLAnchorElement).style.background = "transparent")
                  }
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: "#1a0808" }}>
                      {a.patientName || a.patientCode || "—"}
                    </p>
                    <p className="text-xs font-medium" style={{ color: "#9b6e6e" }}>
                      {a.appointmentType.replace("_", " ")} ·{" "}
                      {new Date(a.scheduledAt).toLocaleString("en-PH", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      APPT_STATUS_CLASSES[a.status] ??
                      "bg-stone-100 text-stone-600 border border-stone-200"
                    }`}
                  >
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
