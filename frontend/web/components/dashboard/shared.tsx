"use client";

/**
 * Building blocks shared by the four role dashboards (components/dashboard/*).
 *
 * Look: "warm clinical editorial", the same family as the sign-in and Verify
 * pages: DM Serif Display headings (`font-display`), warm ink on paper, rose
 * as the accent, and a few semantic tints (teal = healthy/done, amber =
 * attention, red = overdue/problem, sky = information). Every number and
 * panel carries an icon badge so the page reads at a glance.
 *
 * Motion: one staggered rise-in on load (`.dash-rise` in globals.css);
 * disabled under prefers-reduced-motion. Times are Manila time.
 */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CalendarDays, Inbox } from "lucide-react";
import { useCurrentUser } from "@/hooks/useAuth";

const MANILA = "Asia/Manila";

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export type Tone = "rose" | "teal" | "amber" | "red" | "sky" | "slate";

/** Icon-badge and chip colours per tone (background, text, ring). */
export const TONE: Record<Tone, { badge: string; chip: string; bar: string }> = {
  rose: { badge: "bg-rose-50 text-rose-600 ring-rose-100", chip: "bg-rose-50 text-rose-700 ring-rose-200", bar: "bg-rose-500" },
  teal: { badge: "bg-teal-50 text-teal-600 ring-teal-100", chip: "bg-teal-50 text-teal-700 ring-teal-200", bar: "bg-teal-500" },
  amber: { badge: "bg-amber-50 text-amber-600 ring-amber-100", chip: "bg-amber-50 text-amber-800 ring-amber-200", bar: "bg-amber-500" },
  red: { badge: "bg-red-50 text-red-600 ring-red-100", chip: "bg-red-50 text-red-700 ring-red-200", bar: "bg-red-500" },
  sky: { badge: "bg-sky-50 text-sky-600 ring-sky-100", chip: "bg-sky-50 text-sky-700 ring-sky-200", bar: "bg-sky-500" },
  slate: { badge: "bg-stone-100 text-stone-500 ring-stone-200", chip: "bg-stone-100 text-stone-600 ring-stone-200", bar: "bg-stone-400" },
};

const INK = "text-[#2a1414]";
const MUTED = "text-[#8a6a6a]";
const CARD = "rounded-2xl border border-[#eadbd3] bg-white shadow-[0_1px_2px_rgba(60,20,20,0.04),0_8px_24px_-12px_rgba(120,40,40,0.12)]";

/** Staggered rise-in: pass the element's position (0, 1, 2…). */
export function rise(index: number): { className: string; style: CSSProperties } {
  return { className: "dash-rise", style: { animationDelay: `${Math.min(index, 12) * 55}ms` } };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", { timeZone: MANILA, hour: "numeric", minute: "2-digit" });
}

/** A bare YYYY-MM-DD is a Manila calendar date: read it as Manila noon. */
function asInstant(isoOrDate: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? `${isoOrDate}T12:00:00+08:00` : isoOrDate);
}

export function formatDay(isoOrDate: string): string {
  return asInstant(isoOrDate).toLocaleDateString("en-PH", { timeZone: MANILA, month: "short", day: "numeric" });
}

export function formatLongDay(isoDate: string): string {
  return asInstant(isoDate).toLocaleDateString("en-PH", {
    timeZone: MANILA, weekday: "long", month: "long", day: "numeric",
  });
}

export function humanize(value: string): string {
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const ms = Date.parse(`${toIsoDate}T00:00:00Z`) - Date.parse(`${fromIsoDate}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** "Overdue · Nov 18", "Due today", "Tomorrow", "In 3 days · Nov 25". */
export function dueLabel(dueDate: string, today: string): { text: string; tone: Tone } {
  const days = daysBetween(today, dueDate);
  if (days < 0) return { text: `Overdue · ${formatDay(dueDate)}`, tone: "red" };
  if (days === 0) return { text: "Due today", tone: "amber" };
  if (days === 1) return { text: "Tomorrow", tone: "sky" };
  return { text: `In ${days} days · ${formatDay(dueDate)}`, tone: "slate" };
}

function greeting(): string {
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: MANILA, hour: "numeric", hour12: false }));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

export function IconBadge({ icon: Icon, tone = "rose", size = "md" }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-12 w-12 rounded-2xl" : size === "sm" ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl";
  const icon = size === "lg" ? 24 : size === "sm" ? 16 : 20;
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center ring-1 ring-inset ${box} ${TONE[tone].badge}`}>
      <Icon size={icon} strokeWidth={1.9} />
    </span>
  );
}

export function Chip({ icon: Icon, tone = "slate", children }: { icon?: LucideIcon; tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[tone].chip}`}>
      {Icon && <Icon size={12} strokeWidth={2.2} aria-hidden="true" />}
      {children}
    </span>
  );
}

const AVATAR_TONES = [
  "bg-rose-100 text-rose-700", "bg-teal-100 text-teal-700", "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-700", "bg-orange-100 text-orange-700", "bg-emerald-100 text-emerald-700",
];

export function Avatar({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden="true" className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${AVATAR_TONES[hash % AVATAR_TONES.length]}`}>
      {initials}
    </span>
  );
}

const STATUS: Record<string, Tone> = { pending: "amber", confirmed: "teal", completed: "slate", missed: "red" };

export function StatusBadge({ status }: { status: string }) {
  return <Chip tone={STATUS[status] ?? "slate"}>{humanize(status)}</Chip>;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export interface QuickAction {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Greeting container. Uses the account's full name ("Dr. Rosa Cruz", not
 * "Dr."), falling back to the first name in the dashboard payload.
 */
export function DashboardHeader({
  firstName, today, roleLabel, roleIcon, summary, actions = [],
}: {
  firstName: string;
  today: string;
  roleLabel: string;
  roleIcon: LucideIcon;
  summary?: ReactNode;
  actions?: QuickAction[];
}) {
  const { user } = useCurrentUser();
  const name = user?.full_name?.trim() || firstName;
  const RoleIcon = roleIcon;

  return (
    <header
      className={`relative mb-6 overflow-hidden ${CARD} px-6 py-6 sm:px-8 dash-rise`}
      style={{
        backgroundImage:
          "radial-gradient(120% 140% at 100% 0%, rgba(244,63,94,0.10) 0%, rgba(244,63,94,0) 55%), radial-gradient(rgba(181,52,62,0.07) 1px, transparent 1px)",
        backgroundSize: "auto, 18px 18px",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Chip icon={RoleIcon} tone="rose">{roleLabel}</Chip>
            <Chip icon={CalendarDays} tone="slate">{formatLongDay(today)}</Chip>
          </div>
          <h1 className={`font-display text-3xl leading-tight sm:text-4xl ${INK}`}>
            {greeting()}{name ? `, ${name}` : ""}
          </h1>
          {summary && <p className={`mt-2 text-sm sm:text-base ${MUTED}`}>{summary}</p>}
        </div>
        <span aria-hidden="true" className="hidden h-16 w-16 items-center justify-center rounded-3xl bg-linear-to-br from-rose-500 to-rose-700 text-white shadow-lg shadow-rose-900/20 sm:inline-flex">
          <RoleIcon size={30} strokeWidth={1.7} />
        </span>
      </div>

      {actions.length > 0 && (
        <nav aria-label="Quick actions" className="mt-5 flex flex-wrap gap-2">
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className={`group inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 ${
                  i === 0 ? "bg-rose-600 text-white hover:bg-rose-700" : "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                }`}
              >
                <Icon size={17} strokeWidth={2} aria-hidden="true" />
                {a.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

export function StatCard({
  label, value, sub, icon, tone = "rose", href, emphasis = false, index = 0,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  href?: string;
  /** The role's most important number: filled rose card. */
  emphasis?: boolean;
  index?: number;
}) {
  const Icon = icon;
  const a = rise(index + 1);
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-xs font-semibold uppercase tracking-wider ${emphasis ? "text-rose-100" : MUTED}`}>{label}</p>
        {emphasis ? (
          <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-inset ring-white/25">
            <Icon size={20} strokeWidth={1.9} />
          </span>
        ) : (
          <IconBadge icon={Icon} tone={tone} />
        )}
      </div>
      <p className={`mt-3 font-display leading-none ${emphasis ? "text-5xl text-white" : `text-4xl ${INK}`}`}>{value}</p>
      {sub && <p className={`mt-2 text-sm ${emphasis ? "text-rose-100" : MUTED}`}>{sub}</p>}
      {href && (
        <span className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${emphasis ? "text-white" : "text-rose-600"}`}>
          Open <ArrowRight size={12} aria-hidden="true" />
        </span>
      )}
    </>
  );
  const box = emphasis
    ? "rounded-2xl bg-linear-to-br from-rose-500 via-rose-600 to-rose-700 text-white shadow-lg shadow-rose-900/20"
    : CARD;
  const cls = `group relative block h-full overflow-hidden p-5 transition-all ${box} ${a.className} ${href ? "hover:-translate-y-0.5 hover:shadow-lg" : ""}`;

  return href ? (
    <Link href={href} style={a.style} className={`${cls} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500`}>
      {inner}
    </Link>
  ) : (
    <div style={a.style} className={cls}>{inner}</div>
  );
}

export function StatGrid({ children, columns = 4 }: { children: ReactNode; columns?: 3 | 4 }) {
  return (
    <section
      aria-label="Key numbers"
      className={`mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 ${columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
    >
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

export function Panel({
  title, icon, tone = "rose", count, href, linkLabel = "View all", children, className = "", index = 5,
}: {
  title: string;
  icon: LucideIcon;
  tone?: Tone;
  count?: number;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  const a = rise(index);
  return (
    <section aria-label={title} style={a.style} className={`flex flex-col overflow-hidden ${CARD} ${a.className} ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-[#f1e6e0] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <IconBadge icon={icon} tone={tone} size="sm" />
          <h2 className={`truncate text-base font-semibold ${INK}`}>{title}</h2>
          {count !== undefined && <Chip tone={tone}>{count}</Chip>}
        </div>
        {href && (
          <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-rose-600 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500">
            <span className="sr-only sm:not-sr-only">{linkLabel}</span> <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

export function RowList({ children }: { children: ReactNode }) {
  return <ul role="list" className="divide-y divide-[#f4ebe6]">{children}</ul>;
}

/** Friendly empty state: an icon, a short line, and an optional hint. */
export function EmptyRow({ children, hint, icon: Icon = Inbox }: { children: ReactNode; hint?: ReactNode; icon?: LucideIcon }) {
  return (
    <li className="flex flex-col items-center gap-2 px-5 py-10 text-center">
      <span aria-hidden="true" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-stone-400">
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <p className={`text-sm font-medium ${INK}`}>{children}</p>
      {hint && <p className={`max-w-xs text-xs ${MUTED}`}>{hint}</p>}
    </li>
  );
}

export function TwoColumns({ children }: { children: ReactNode }) {
  return <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">{children}</div>;
}

export const text = { ink: INK, muted: MUTED, card: CARD };
