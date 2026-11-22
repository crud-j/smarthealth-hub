"use client";

/**
 * System Health (Admin): is everything the health center relies on working?
 *
 * Written for a non-technical admin. One answer at the top (the "vital
 * sign" banner), then anything that needs attention with what it means, then
 * every check grouped under a plain question: are the records safe, is the
 * system running, are messages and sign-ins going through. Technical names
 * (PostgreSQL, Redis, Celery) are kept small for whoever fixes the server.
 *
 * Same look as the Admin dashboard's System health panel (status icons and
 * tints from components/dashboard). Counts only, no patient data.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle, ArrowDown, BellRing, CheckCircle2, Clock, Cpu, Database, DatabaseBackup,
  GitCommitHorizontal, HardDrive, HelpCircle, Images, Info, KeyRound, LockKeyhole,
  MemoryStick, MessageSquareText, RefreshCw, ServerCog, ShieldAlert, ShieldCheck,
  ShieldQuestion, ShieldX, Siren, XCircle,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api-client";
import AccessDenied from "@/components/layout/AccessDenied";
import RoleGuard from "@/components/layout/RoleGuard";
import { IconBadge, TONE, rise, text } from "@/components/dashboard/shared";
import type { Tone } from "@/components/dashboard/shared";
import {
  reminderLine,
  signInHeadline,
  signInLine,
  smsHeadline,
  smsLine,
  type ReminderRun,
  type SignInWindow,
  type SmsWindow,
} from "@/lib/reliability";

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
  // Optional: Vercel ships this page before the backend is redeployed, and an
  // older backend does not send it. Those checks are hidden until it does.
  reliability?: {
    sms: Check & { last_24h: SmsWindow; last_7d: SmsWindow };
    sign_in: Check & { last_24h: SignInWindow; last_7d: SignInWindow };
    reminders: Check & { runs: ReminderRun[] };
  };
}

const REFRESH_MS = 60_000;

// ---------------------------------------------------------------------------
// Formatting
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

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Status look (same words and tints as the Admin dashboard tiles)
// ---------------------------------------------------------------------------

const STATUS_LOOK: Record<CheckStatus, { label: string; tone: Tone; icon: LucideIcon; card: string }> = {
  ok: { label: "Working", tone: "teal", icon: CheckCircle2, card: "border-[#eadbd3] bg-white" },
  warning: { label: "Needs a look", tone: "amber", icon: AlertTriangle, card: "border-amber-200 bg-linear-to-br from-white to-amber-50/70" },
  error: { label: "Not working", tone: "red", icon: XCircle, card: "border-red-200 bg-linear-to-br from-white to-red-50/80" },
  unknown: { label: "Can't tell", tone: "slate", icon: HelpCircle, card: "border-stone-200 bg-stone-50/60" },
};

const HERO: Record<CheckStatus, { title: string; icon: LucideIcon; panel: string; trace: string }> = {
  ok: {
    title: "Everything is working",
    icon: ShieldCheck,
    panel: "border-teal-200/70 bg-linear-to-br from-[#f3fbf8] via-white to-[#fdf7f3]",
    trace: "text-teal-500",
  },
  warning: {
    title: "Working, but something needs a look",
    icon: ShieldAlert,
    panel: "border-amber-200 bg-linear-to-br from-amber-50 via-white to-[#fdf7f3]",
    trace: "text-amber-500",
  },
  error: {
    title: "Something is not working",
    icon: ShieldX,
    panel: "border-red-200 bg-linear-to-br from-red-50 via-white to-[#fdf7f3]",
    trace: "text-red-500",
  },
  unknown: {
    title: "We can't tell right now",
    icon: ShieldQuestion,
    panel: "border-stone-200 bg-linear-to-br from-stone-50 via-white to-[#fdf7f3]",
    trace: "text-stone-400",
  },
};

function StatusChip({ status }: { status: CheckStatus }) {
  const look = STATUS_LOOK[status];
  const Icon = look.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE[look.tone].chip}`}>
      <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
      {look.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The checks, in plain words
// ---------------------------------------------------------------------------

interface Item {
  key: string;
  /** Plain name an admin understands. */
  name: string;
  /** What it is for, in one line. */
  purpose: string;
  /** The technical name, for whoever fixes the server. */
  tech: string;
  icon: LucideIcon;
  check: Check;
  /** The one figure that answers "is it OK?". */
  value: ReactNode;
  /** Supporting facts, one per line. */
  facts?: ReactNode[];
  meter?: { percent: number; label: string };
}

interface Group {
  id: string;
  question: string;
  icon: LucideIcon;
  items: Item[];
}

function buildGroups(d: SystemStatus): Group[] {
  const r = d.reliability;
  const latestRun =
    r?.reminders.runs
      .map((run) => run.last_run_at)
      .filter((at): at is string => at !== null)
      .sort()
      .at(-1) ?? null;

  const backupFacts: ReactNode[] = [];
  if (d.backup.last_success_at) {
    backupFacts.push(`Last good copy: ${formatManila(d.backup.last_success_at)}`);
    backupFacts.push(`Records ${formatBytes(d.backup.db_bytes)} · photos and PDFs ${formatBytes(d.backup.media_bytes)}`);
  }
  if (d.backup.schedule) {
    backupFacts.push(`Runs ${d.backup.schedule}${d.backup.keep_days !== null ? `, keeps ${d.backup.keep_days} days` : ""}`);
  }

  const messages: Item[] = [];
  if (r) {
    messages.push(
      {
        key: "sms",
        name: "SMS delivery",
        purpose: "Reminders and notices texted to patients",
        tech: "Semaphore SMS gateway",
        icon: MessageSquareText,
        check: r.sms,
        value: smsHeadline(r.sms.last_24h),
        facts: [smsLine("Last 24 hours", r.sms.last_24h), smsLine("Last 7 days", r.sms.last_7d), "Only failures the SMS gateway reports are counted."],
      },
      {
        key: "reminders",
        name: "Automatic reminders",
        purpose: "Appointment (every hour) and immunization (daily) texts",
        tech: "Celery beat jobs",
        icon: BellRing,
        check: r.reminders,
        value: latestRun ? `Last run ${formatManila(latestRun)}` : "Not run yet",
        facts: r.reminders.runs.map((run) => reminderLine(run)),
      },
      {
        key: "sign_in",
        name: "Staff sign-ins",
        purpose: "Password and one-time code (OTP) sign-ins",
        tech: "Auth + OTP",
        icon: KeyRound,
        check: r.sign_in,
        value: signInHeadline(r.sign_in.last_24h),
        facts: [signInLine("Last 24 hours", r.sign_in.last_24h), signInLine("Last 7 days", r.sign_in.last_7d)],
      },
    );
  }
  messages.push({
    key: "alerts",
    name: "Admin SMS alerts",
    purpose: "Texts you when reminders keep failing",
    tech: "ADMIN_ALERT_PHONE",
    icon: Siren,
    check: d.alerts,
    value: d.alerts.admin_alert_phone_configured ? "Phone set" : "No phone set",
  });

  return [
    {
      id: "records",
      question: "Are patient records safe?",
      icon: LockKeyhole,
      items: [
        {
          key: "backup",
          name: "Backups",
          purpose: "A copy of all records, kept off the main database",
          tech: "pg_dump + media archive",
          icon: DatabaseBackup,
          check: d.backup,
          value: d.backup.last_success_at ? `Last copy ${formatAgeHours(d.backup.age_hours)}` : "No copy yet",
          facts: backupFacts,
        },
        {
          key: "disk",
          name: "Storage space",
          purpose: "Room left on the server for new records and files",
          tech: "Server disk",
          icon: HardDrive,
          check: d.disk,
          value: d.disk.free_bytes !== null ? `${formatBytes(d.disk.free_bytes)} free` : "—",
          meter:
            d.disk.used_percent !== null
              ? { percent: d.disk.used_percent, label: `${d.disk.used_percent}% used of ${formatBytes(d.disk.total_bytes)}` }
              : undefined,
        },
        {
          key: "media",
          name: "Photos and card PDFs",
          purpose: "Patient photos and health-card files",
          tech: "Media folder",
          icon: Images,
          check: d.media,
          value: formatBytes(d.media.size_bytes),
          facts: d.media.file_count !== null ? [`${d.media.file_count.toLocaleString("en-PH")} files`] : [],
        },
      ],
    },
    {
      id: "running",
      question: "Is the system running?",
      icon: ServerCog,
      items: [
        {
          key: "database",
          name: "Patient database",
          purpose: "Where every record is stored",
          tech: "PostgreSQL",
          icon: Database,
          check: d.database,
          value: d.database.status === "ok" ? "Connected" : "Can't reach it",
          facts: d.database.status === "ok" ? [`Size of all records: ${formatBytes(d.database.size_bytes)}`] : [],
        },
        {
          key: "redis",
          name: "Sign-in codes and job queue",
          purpose: "Holds OTP codes, sessions and waiting jobs",
          tech: "Redis",
          icon: MemoryStick,
          check: d.redis,
          value: d.redis.status === "ok" ? "Connected" : "Can't reach it",
        },
        {
          key: "workers",
          name: "Background jobs",
          purpose: "Sends SMS, makes card PDFs and reports",
          tech: "Celery worker + scheduler",
          icon: Cpu,
          check: d.workers,
          value: d.workers.age_seconds !== null ? `Last heard ${formatAgeSeconds(d.workers.age_seconds)}` : "Not heard from",
        },
      ],
    },
    {
      id: "messages",
      question: "Are messages and sign-ins going through?",
      icon: MessageSquareText,
      items: messages,
    },
  ];
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** A calm heartbeat trace: the page's "vital sign". Decorative only. */
function HeartbeatTrace({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 60"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full opacity-40 ${className}`}
    >
      <path
        className="health-trace"
        pathLength={1}
        d="M0 38 H70 L80 38 L88 30 L96 38 L104 38 L112 8 L122 54 L130 38 L150 38 L158 32 L166 38 H240 L250 38 L258 30 L266 38 L274 38 L282 14 L290 50 L298 38 H320"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Hero({ data, items }: { data: SystemStatus; items: Item[] }) {
  const hero = HERO[data.overall];
  const Icon = hero.icon;
  const working = items.filter((i) => i.check.status === "ok").length;
  const flagged = items.filter((i) => i.check.status !== "ok");
  const sentence =
    flagged.length === 0
      ? "Records are being backed up, reminders are going out and staff can sign in. Nothing for you to do."
      : flagged.length === 1
        ? `${flagged[0].name}: ${STATUS_LOOK[flagged[0].check.status].label.toLowerCase()}. See below for what it means.`
        : `${flagged.length} checks need a look. Start with the ones marked "Not working".`;
  const a = rise(0);

  return (
    <section
      role="status"
      aria-label="Overall status"
      style={a.style}
      className={`relative mb-8 overflow-hidden rounded-3xl border px-6 pb-14 pt-6 sm:px-8 sm:pt-8 ${hero.panel} ${a.className}`}
    >
      <HeartbeatTrace className={hero.trace} />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
        <span
          aria-hidden="true"
          className={`inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ${TONE[STATUS_LOOK[data.overall].tone].badge}`}
        >
          <Icon size={32} strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${text.muted}`}>System status</p>
          <h2 className={`mt-1 font-display text-3xl leading-tight sm:text-4xl ${text.ink}`}>{hero.title}</h2>
          <p className={`mt-2 max-w-2xl text-[15px] leading-relaxed ${text.muted}`}>{sentence}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${TONE.teal.chip}`}>
              <CheckCircle2 size={14} aria-hidden="true" /> {working} of {items.length} working
            </span>
            {flagged.length > 0 && (
              <a
                href="#needs-attention"
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500 ${TONE[STATUS_LOOK[data.overall].tone].chip}`}
              >
                <ArrowDown size={14} aria-hidden="true" /> {flagged.length} to look at
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function NeedsAttention({ items }: { items: Item[] }) {
  // Worst first: not working, then can't tell, then needs a look.
  const order: Record<CheckStatus, number> = { error: 0, unknown: 1, warning: 2, ok: 3 };
  const sorted = [...items].sort((x, y) => order[x.check.status] - order[y.check.status]);
  const a = rise(1);
  return (
    <section id="needs-attention" aria-labelledby="needs-attention-title" style={a.style} className={`mb-10 ${a.className}`}>
      <h2 id="needs-attention-title" className={`mb-3 flex items-center gap-2 font-display text-2xl ${text.ink}`}>
        Needs your attention
      </h2>
      <ul role="list" className={`divide-y divide-[#f4ebe6] overflow-hidden ${text.card}`}>
        {sorted.map((item) => (
          <li key={item.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <IconBadge icon={item.icon} tone={STATUS_LOOK[item.check.status].tone} size="sm" />
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${text.ink}`}>{item.name}</p>
                <p className={`mt-0.5 text-sm leading-relaxed ${text.ink}`}>{item.check.message}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3 pl-11 sm:pl-0">
              <StatusChip status={item.check.status} />
              <a href={`#check-${item.key}`} className="text-sm font-medium text-rose-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500">
                Details
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Meter({ percent, label, tone }: { percent: number; label: string; tone: Tone }) {
  return (
    <div className="mt-3">
      <div
        className="h-2 overflow-hidden rounded-full bg-stone-100"
        role="meter"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Storage used"
      >
        <div className={`h-full rounded-full ${TONE[tone].bar}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className={`mt-1.5 text-xs ${text.muted}`}>{label}</p>
    </div>
  );
}

function CheckCard({ item, index }: { item: Item; index: number }) {
  const look = STATUS_LOOK[item.check.status];
  const ok = item.check.status === "ok";
  const a = rise(index);
  return (
    <article
      id={`check-${item.key}`}
      aria-label={item.name}
      style={a.style}
      className={`flex scroll-mt-24 flex-col rounded-2xl border p-5 shadow-[0_1px_2px_rgba(60,20,20,0.04),0_8px_24px_-14px_rgba(120,40,40,0.14)] ${look.card} ${a.className}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconBadge icon={item.icon} tone={look.tone} />
          <div className="min-w-0">
            <h3 className={`text-[15px] font-semibold leading-snug ${text.ink}`}>{item.name}</h3>
            <p className={`mt-0.5 text-xs leading-snug ${text.muted}`}>{item.purpose}</p>
          </div>
        </div>
        <StatusChip status={item.check.status} />
      </header>

      <p className={`mt-4 font-display text-2xl leading-tight ${text.ink}`}>{item.value}</p>
      {item.meter && <Meter percent={item.meter.percent} label={item.meter.label} tone={look.tone} />}

      {item.facts && item.facts.length > 0 && (
        <ul role="list" className={`mt-3 space-y-1 text-xs leading-relaxed ${text.muted}`}>
          {item.facts.map((fact, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#d9c3ba]" />
              <span>{fact}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-4">
        {ok ? (
          <p className={`border-t border-[#f4ebe6] pt-3 text-xs ${text.muted}`}>{item.check.message}</p>
        ) : (
          <p className={`flex gap-2 rounded-xl px-3 py-2.5 text-sm font-medium leading-snug ring-1 ring-inset ${TONE[look.tone].chip}`}>
            <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{item.check.message}</span>
          </p>
        )}
        <p className="mt-2 font-mono text-[11px] text-[#b59c96]">{item.tech}</p>
      </div>
    </article>
  );
}

function GroupSection({ group, startIndex }: { group: Group; startIndex: number }) {
  const flagged = group.items.filter((i) => i.check.status !== "ok").length;
  return (
    <section aria-labelledby={`group-${group.id}`} className="mb-10">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <IconBadge icon={group.icon} tone="rose" size="sm" />
        <h2 id={`group-${group.id}`} className={`font-display text-2xl ${text.ink}`}>
          {group.question}
        </h2>
        <span className={`text-sm font-medium ${flagged ? "text-amber-700" : "text-teal-700"}`}>
          {flagged ? `${flagged} to look at` : "Yes"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {group.items.map((item, i) => (
          <CheckCard key={item.key} item={item} index={startIndex + i} />
        ))}
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true">
      <div className="mb-8 h-44 animate-pulse rounded-3xl bg-[#f6ece7]" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl border border-[#eadbd3] bg-white" />
        ))}
      </div>
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

  const groups = data ? buildGroups(data) : [];
  const items = groups.flatMap((g) => g.items);
  const flagged = items.filter((i) => i.check.status !== "ok");

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={`font-display text-3xl leading-tight sm:text-4xl ${text.ink}`}>System Health</h1>
          <p className={`mt-1 text-sm ${text.muted}`}>A plain check of everything the health center relies on.</p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className={`inline-flex items-center gap-2 text-xs ${text.muted}`}>
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${data.overall === "ok" ? "dash-pulse bg-emerald-500" : TONE[STATUS_LOOK[data.overall].tone].bar}`}
              />
              <Clock size={13} aria-hidden="true" />
              Checked {formatClock(data.checked_at)} · updates every minute
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-[#e5d4cc] bg-white px-3.5 py-2 text-sm font-semibold text-[#2a1414] shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
            {refreshing ? "Checking…" : "Check now"}
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">
          <XCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{data ? `Could not refresh: ${error} Showing the last result.` : error}</span>
        </div>
      )}

      {loading && !data ? (
        <Skeleton />
      ) : data ? (
        <>
          <Hero data={data} items={items} />
          {flagged.length > 0 && <NeedsAttention items={flagged} />}
          {groups.map((group, gi) => (
            <GroupSection
              key={group.id}
              group={group}
              startIndex={2 + groups.slice(0, gi).reduce((n, g) => n + g.items.length, 0)}
            />
          ))}

          {/* Version: for whoever deploys the server */}
          <footer className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-dashed border-[#e5d4cc] px-5 py-3 text-xs ${text.muted}`}>
            <GitCommitHorizontal size={16} aria-hidden="true" />
            <span>
              Version running on the server:{" "}
              <span className={`font-mono font-semibold ${text.ink}`}>{data.version.commit}</span> · {data.version.environment}
            </span>
            {data.version.commit === "unknown" && <span>Deploy with scripts/deploy.sh to record it.</span>}
          </footer>
        </>
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
