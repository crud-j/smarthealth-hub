"use client";

/**
 * Building blocks shared by the four role dashboards (components/dashboard/*).
 * Same visual language as the older dashboard: rose accent, slate text,
 * white rounded panels. Times are shown in Manila time.
 */

import Link from "next/link";
import type { ReactNode } from "react";

const MANILA = "Asia/Manila";

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", {
    timeZone: MANILA, hour: "numeric", minute: "2-digit",
  });
}

export function formatDay(isoOrDate: string): string {
  // A bare YYYY-MM-DD is a Manila calendar date: read it as Manila noon.
  const value = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? `${isoOrDate}T12:00:00+08:00` : isoOrDate;
  return new Date(value).toLocaleDateString("en-PH", { timeZone: MANILA, month: "short", day: "numeric" });
}

export function formatLongDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: MANILA, weekday: "short", month: "short", day: "numeric",
  });
}

export function humanize(value: string): string {
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function greeting(): string {
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: MANILA, hour: "numeric", hour12: false }));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export interface QuickAction {
  href: string;
  label: string;
}

export function DashboardHeader({
  firstName, today, roleLabel, actions = [],
}: {
  firstName: string;
  today: string;
  roleLabel: string;
  actions?: QuickAction[];
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {greeting()}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-slate-500">
          {formatLongDay(today)} · {roleLabel}
        </p>
      </div>
      {actions.length > 0 && (
        <nav aria-label="Quick actions" className="mt-4 flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
            >
              {a.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

export function StatCard({
  label, value, sub, href, emphasis = false, tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  href?: string;
  /** The role's most important number: filled rose card. */
  emphasis?: boolean;
  tone?: "default" | "warning";
}) {
  const box = emphasis
    ? "bg-rose-600 text-white hover:bg-rose-700"
    : tone === "warning"
      ? "border border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300"
      : "border border-slate-200 bg-white text-slate-900 hover:border-slate-300";
  const labelCls = emphasis ? "text-rose-100" : tone === "warning" ? "text-amber-700" : "text-slate-500";
  const subCls = emphasis ? "text-rose-100" : "text-slate-500";

  const inner = (
    <>
      <p className={`text-xs font-semibold uppercase tracking-wide ${labelCls}`}>{label}</p>
      <p className={`mt-2 font-semibold tracking-tight ${emphasis ? "text-4xl" : "text-3xl"}`}>{value}</p>
      {sub && <p className={`mt-1 text-sm ${subCls}`}>{sub}</p>}
    </>
  );
  const cls = `block h-full rounded-xl p-5 shadow-sm transition-colors ${box}`;
  return href ? (
    <Link href={href} className={`${cls} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Key numbers" className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Panels and rows
// ---------------------------------------------------------------------------

export function Panel({
  title, href, linkLabel = "View all", children, className = "",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={`flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {href && (
          <Link href={href} className="text-sm font-medium text-rose-600 hover:text-rose-500 focus-visible:underline focus-visible:outline-none">
            {linkLabel} →
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

export function RowList({ children }: { children: ReactNode }) {
  return <ul role="list" className="divide-y divide-slate-100">{children}</ul>;
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <li className="px-5 py-8 text-center text-sm text-slate-500">{children}</li>;
}

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-800 ring-yellow-600/20",
  confirmed: "bg-green-50 text-green-800 ring-green-600/20",
  completed: "bg-slate-50 text-slate-700 ring-slate-600/20",
  missed: "bg-red-50 text-red-800 ring-red-600/20",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_CLASSES[status] ?? STATUS_CLASSES.pending}`}>
      {humanize(status)}
    </span>
  );
}

export function TwoColumns({ children }: { children: ReactNode }) {
  return <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">{children}</div>;
}
