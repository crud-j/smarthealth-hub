"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api-client";
import AccessDenied from "@/components/layout/AccessDenied";
import RoleGuard from "@/components/layout/RoleGuard";

// ---------------------------------------------------------------------------
// Types (mirror backend/app/schemas/system_config.py SystemStatusResponse)
// ---------------------------------------------------------------------------

type CheckStatus = "ok" | "warning" | "error" | "unknown";

interface Check {
  status: CheckStatus;
  message: string;
}

interface SystemStatus {
  overall: CheckStatus;
  checked_at: string;
  version: { commit: string; environment: string };
  database: Check & { size_bytes: number | null };
  redis: Check;
  workers: Check & { last_heartbeat_at: string | null; age_seconds: number | null };
  disk: Check & { total_bytes: number | null; free_bytes: number | null; used_percent: number | null };
  media: Check & { size_bytes: number | null; file_count: number | null };
  backup: Check & {
    last_success_at: string | null;
    age_hours: number | null;
    last_attempt_at: string | null;
    db_bytes: number | null;
    media_bytes: number | null;
    schedule: string | null;
    keep_days: number | null;
  };
  alerts: Check & { admin_alert_phone_configured: boolean };
}

const REFRESH_MS = 60_000;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatAgeSeconds(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} s ago`;
  return `${Math.round(seconds / 60)} min ago`;
}

function formatAgeHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function formatManila(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Status styling
// ---------------------------------------------------------------------------

const PILL: Record<CheckStatus, { label: string; className: string }> = {
  ok: { label: "OK", className: "bg-emerald-100 text-emerald-700 border border-emerald-200" },
  warning: { label: "Warning", className: "bg-amber-100 text-amber-800 border border-amber-200" },
  error: { label: "Error", className: "bg-red-100 text-red-700 border border-red-200" },
  unknown: { label: "Unknown", className: "bg-stone-100 text-stone-600 border border-stone-200" },
};

const BANNER: Record<CheckStatus, { title: string; className: string }> = {
  ok: { title: "All systems working", className: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  warning: { title: "Working, but something needs attention", className: "border-amber-200 bg-amber-50 text-amber-900" },
  error: { title: "Something is broken — act now", className: "border-red-200 bg-red-50 text-red-900" },
  unknown: { title: "Status unknown", className: "border-stone-200 bg-stone-50 text-stone-800" },
};

function StatusPill({ status }: { status: CheckStatus }) {
  const pill = PILL[status];
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${pill.className}`}>
      {pill.label}
    </span>
  );
}

interface HealthCardProps {
  title: string;
  check: Check;
  value: React.ReactNode;
  detail?: React.ReactNode;
}

function HealthCard({ title, check, value, detail }: HealthCardProps) {
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-[#e5d4cc] bg-white px-5 py-4"
      style={{ boxShadow: "0 1px 6px rgba(160,80,80,0.06)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">{title}</h3>
        <StatusPill status={check.status} />
      </div>
      <p className="text-lg font-semibold text-[#1a0808]">{value}</p>
      {detail && <div className="text-xs text-[#7a5252]">{detail}</div>}
      <p className={`text-sm ${check.status === "ok" ? "text-[#7a5252]" : "font-medium text-[#1a0808]"}`}>
        {check.message}
      </p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#e5d4cc] bg-white px-5 py-4">
      <div className="h-3 w-24 animate-pulse rounded bg-[#f0ddd8]" />
      <div className="mt-1 h-6 w-32 animate-pulse rounded bg-[#f5e8e4]" />
      <div className="h-3 w-48 animate-pulse rounded bg-[#f5e8e4]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function SystemHealth() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  // Bumped by the Refresh button; re-runs the effect (fetch now + new timer).
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await apiFetch<SystemStatus>("/system/status");
        if (cancelled) return;
        setData(result);
        setError("");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setError("Only administrators can view System Health.");
        } else {
          // Keep showing the last good result; the API itself may be down.
          setError(err instanceof ApiError ? err.message : "Could not reach the server.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshKey]);

  function handleRefresh() {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
  }

  const banner = data ? BANNER[data.overall] : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl leading-tight text-[#1a0808]">System Health</h1>
          <p className="mt-1 text-sm font-medium text-[#7a5252]">
            Is everything working? Refreshes every minute.
            {data && <> Last checked {formatManila(data.checked_at)}.</>}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-[#e5d4cc] bg-white px-3 py-2 text-sm font-medium text-[#1a0808] transition-colors hover:border-[#c08080] hover:bg-[#fdf0eb] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5343e] focus-visible:ring-offset-2"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">
          {data ? `Could not refresh: ${error} Showing the last result.` : error}
        </div>
      )}

      {banner && data && (
        <div className={`mb-6 rounded-xl border px-5 py-4 ${banner.className}`} role="status">
          <p className="text-base font-bold">{banner.title}</p>
          {data.overall !== "ok" && (
            <p className="mt-1 text-sm">Read the cards marked Warning or Error below; each says what to do.</p>
          )}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <HealthCard
            title="Backups"
            check={data.backup}
            value={data.backup.last_success_at ? `Last good: ${formatAgeHours(data.backup.age_hours)}` : "None yet"}
            detail={
              data.backup.last_success_at && (
                <>
                  {formatManila(data.backup.last_success_at)} · database {formatBytes(data.backup.db_bytes)} · media{" "}
                  {formatBytes(data.backup.media_bytes)}
                  {data.backup.schedule && (
                    <>
                      <br />
                      Runs {data.backup.schedule}
                      {data.backup.keep_days !== null && <>, keeps {data.backup.keep_days} days</>}
                    </>
                  )}
                </>
              )
            }
          />

          <HealthCard
            title="Background jobs"
            check={data.workers}
            value={data.workers.age_seconds !== null ? `Last signal ${formatAgeSeconds(data.workers.age_seconds)}` : "No signal"}
            detail="Celery worker + scheduler: SMS reminders, card PDFs, reports"
          />

          <HealthCard
            title="Database"
            check={data.database}
            value={data.database.status === "ok" ? formatBytes(data.database.size_bytes) : "Unreachable"}
            detail="PostgreSQL · size of all records"
          />

          <HealthCard
            title="Redis"
            check={data.redis}
            value={data.redis.status === "ok" ? "Connected" : "Unreachable"}
            detail="Job queue, login sessions, OTP codes"
          />

          <HealthCard
            title="Disk"
            check={data.disk}
            value={data.disk.free_bytes !== null ? `${formatBytes(data.disk.free_bytes)} free` : "—"}
            detail={
              data.disk.used_percent !== null && (
                <div>
                  <div className="mb-1">
                    {data.disk.used_percent}% used of {formatBytes(data.disk.total_bytes)}
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f5e8e4]" aria-hidden="true">
                    <div
                      className={`h-full rounded-full ${
                        data.disk.status === "error" ? "bg-red-500" : data.disk.status === "warning" ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, data.disk.used_percent)}%` }}
                    />
                  </div>
                </div>
              )
            }
          />

          <HealthCard
            title="Media files"
            check={data.media}
            value={formatBytes(data.media.size_bytes)}
            detail={data.media.file_count !== null && `${data.media.file_count} files`}
          />

          <HealthCard
            title="Admin alerts"
            check={data.alerts}
            value={data.alerts.admin_alert_phone_configured ? "Configured" : "Not set"}
            detail="SMS to the admin when reminders keep failing"
          />

          <HealthCard
            title="Version"
            check={{
              status: data.version.commit === "unknown" ? "unknown" : "ok",
              message: `Environment: ${data.version.environment}`,
            }}
            value={<span className="font-mono">{data.version.commit}</span>}
            detail={data.version.commit === "unknown" ? "Deploy with scripts/deploy.sh to record the commit" : "Git commit running on the server"}
          />
        </div>
      ) : null}
    </div>
  );
}

// Admin only (backend: require_role("admin")). Non-admins who type the URL get
// a clear message instead of a failed API call.
export default function SystemHealthPage() {
  return (
    <RoleGuard roles={["admin"]} fallback={<AccessDenied allowed="Admins" what="system health" />}>
      <SystemHealth />
    </RoleGuard>
  );
}
