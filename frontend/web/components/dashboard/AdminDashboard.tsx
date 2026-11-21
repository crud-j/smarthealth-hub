"use client";

import Link from "next/link";
import {
  AlertTriangle, BellRing, CalendarClock, CheckCircle2, Cpu, Database, DatabaseBackup,
  FileUser, HardDrive, HelpCircle, Inbox, KeyRound, MessageSquareText, ShieldAlert,
  ShieldCheck, Syringe, UserCog, Users, XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminDashboardData, CheckStatus } from "@/types/dashboard";
import {
  Chip, DashboardHeader, EmptyRow, Panel, RowList, StatCard, StatGrid, TONE, TwoColumns,
  formatDay, formatTime, rise, text,
} from "./shared";
import type { Tone } from "./shared";

// Admin model B: system, registrations and accounts only. Nothing clinical.

const STATUS: Record<CheckStatus, { label: string; tone: Tone; icon: LucideIcon; tile: string }> = {
  ok: { label: "Healthy", tone: "teal", icon: CheckCircle2, tile: "border-teal-100 bg-linear-to-br from-white to-teal-50/60" },
  warning: { label: "Needs attention", tone: "amber", icon: AlertTriangle, tile: "border-amber-200 bg-linear-to-br from-white to-amber-50" },
  error: { label: "Problem", tone: "red", icon: XCircle, tile: "border-red-200 bg-linear-to-br from-white to-red-50" },
  unknown: { label: "Unknown", tone: "slate", icon: HelpCircle, tile: "border-stone-200 bg-stone-50" },
};

/** One System Health check as a tile: icon, status pill, plain-language reason. */
function HealthTile({
  name, icon: Icon, status, message, index, children,
}: {
  name: string;
  icon: LucideIcon;
  status: CheckStatus;
  message: string;
  index: number;
  children?: React.ReactNode;
}) {
  const s = STATUS[status];
  const StatusIcon = s.icon;
  const a = rise(index);
  return (
    <div role="group" aria-label={name} style={a.style} className={`flex flex-col gap-3 rounded-xl border p-4 ${s.tile} ${a.className}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2.5">
          <span aria-hidden="true" className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset ${TONE[s.tone].badge}`}>
            <Icon size={18} strokeWidth={1.9} />
          </span>
          <span className={`text-sm font-semibold ${text.ink}`}>{name}</span>
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONE[s.tone].chip}`}>
          <StatusIcon size={12} strokeWidth={2.4} aria-hidden="true" />
          {s.label}
        </span>
      </div>
      {children}
      {message && <p className={`text-xs leading-relaxed ${text.muted}`}>{message}</p>}
    </div>
  );
}

function Meter({ percent, tone }: { percent: number; tone: Tone }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className={`font-display text-2xl ${text.ink}`}>{Math.round(percent)}%</span>
        <span className={`text-xs ${text.muted}`}>used</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-100" role="meter" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label="Disk used">
        <div className={`h-full rounded-full ${TONE[tone].bar}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

function Figure({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <span className={`font-display text-2xl ${text.ink}`}>{value}</span>
      <span className={`ml-1.5 text-xs ${text.muted}`}>{label}</span>
    </div>
  );
}

export default function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const s = data.system;
  const r = s.reliability;

  const checks: { name: string; status: CheckStatus }[] = [
    { name: "Database", status: s.database.status },
    { name: "Redis", status: s.redis.status },
    { name: "Workers", status: s.workers.status },
    { name: "Disk", status: s.disk.status },
    { name: "Media", status: s.media.status },
    { name: "Backups", status: s.backup.status },
    { name: "Admin alerts", status: s.alerts.status },
    { name: "SMS", status: r.sms.status },
    { name: "Sign-ins", status: r.sign_in.status },
  ];
  const flagged = checks.filter((c) => c.status !== "ok");
  const overall = STATUS[s.overall];
  const OverallIcon = s.overall === "ok" ? ShieldCheck : overall.icon;
  const overallText =
    flagged.length === 0
      ? "All systems healthy"
      : flagged.length === 1
        ? `${flagged[0].name} ${flagged[0].status === "error" ? "has a problem" : "needs attention"}`
        : `${flagged.length} checks need attention`;

  const run = (job: "appointment" | "immunization") => r.reminders.runs.find((x) => x.job === job);
  const runText = (job: "appointment" | "immunization") => {
    const x = run(job);
    if (!x?.last_run_at) return "Not recorded yet";
    return `${formatDay(x.last_run_at)}, ${formatTime(x.last_run_at)}${x.queued !== null ? ` · ${x.queued} SMS` : ""}`;
  };

  return (
    <>
      <DashboardHeader
        firstName={data.first_name}
        today={data.today}
        roleLabel="Administrator"
        roleIcon={UserCog}
        summary={overallText}
      />

      <StatGrid>
        <StatCard
          index={0}
          label="System"
          value={<span className="text-2xl leading-tight">{overallText}</span>}
          sub={`Version ${s.version.commit}`}
          icon={OverallIcon}
          tone={overall.tone}
          href="/settings/system-health"
        />
        <StatCard
          index={1}
          label="Registrations to review"
          value={data.online_applications_pending + data.previsit_forms_waiting}
          sub={`online ${data.online_applications_pending} · drafts ${data.previsit_forms_waiting}`}
          icon={Inbox}
          href="/registrations"
          emphasis
        />
        <StatCard
          index={2}
          label="Staff accounts"
          value={<>{data.staff.active}<span className={`text-2xl ${text.muted}`}> active</span></>}
          sub={`${data.staff.not_signed_in_30d} not signed in for 30+ days`}
          icon={Users}
          tone="sky"
          href="/settings/users"
        />
        <StatCard index={3} label="Active patients" value={data.active_patients} sub="registered" icon={FileUser} tone="teal" href="/patients" />
      </StatGrid>

      <Panel title="System health" icon={ShieldCheck} tone={overall.tone} href="/settings/system-health" linkLabel="Details" className="mb-6" index={5}>
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#f4ebe6] px-5 py-2.5 text-xs ${text.muted}`}>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.overall === "ok" ? "dash-pulse bg-emerald-500" : TONE[overall.tone].bar}`} />
            Checked {formatTime(s.checked_at)}
          </span>
          <span>Version <span className="font-mono">{s.version.commit}</span> · {s.version.environment}</span>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <HealthTile index={6} name="Database" icon={Database} status={s.database.status} message={s.database.message} />
          <HealthTile index={7} name="Workers" icon={Cpu} status={s.workers.status} message={s.workers.message} />
          <HealthTile index={8} name="Backups" icon={DatabaseBackup} status={s.backup.status} message={s.backup.message}>
            {s.backup.last_success_at && <Figure value={formatTime(s.backup.last_success_at)} label={`last, ${formatDay(s.backup.last_success_at)}`} />}
          </HealthTile>
          <HealthTile index={9} name="Disk" icon={HardDrive} status={s.disk.status} message={s.disk.message}>
            {s.disk.used_percent !== null && <Meter percent={s.disk.used_percent} tone={STATUS[s.disk.status].tone} />}
          </HealthTile>
          <HealthTile index={10} name="SMS" icon={MessageSquareText} status={r.sms.status} message={r.sms.message}>
            <Figure value={<>{r.sms.last_24h.sent}<span className={`text-base ${text.muted}`}> · {r.sms.last_24h.failed} failed</span></>} label="sent in 24 h" />
          </HealthTile>
          <HealthTile index={11} name="Sign-ins" icon={KeyRound} status={r.sign_in.status} message={r.sign_in.message}>
            <div>
              <Figure value={r.sign_in.last_24h.successful} label="sign-ins in 24 h" />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Chip tone={r.sign_in.last_24h.failed_password > 0 ? "amber" : "slate"}>{r.sign_in.last_24h.failed_password} wrong passwords</Chip>
                <Chip tone={r.sign_in.last_24h.failed_otp > 0 ? "amber" : "slate"}>{r.sign_in.last_24h.failed_otp} wrong OTP</Chip>
              </div>
            </div>
          </HealthTile>
          <HealthTile index={12} name="Admin alerts" icon={BellRing} status={s.alerts.status} message={s.alerts.message} />
          <div role="group" aria-label="Reminder runs" className={`flex flex-col gap-2 rounded-xl border border-sky-100 bg-linear-to-br from-white to-sky-50/60 p-4 ${rise(13).className}`} style={rise(13).style}>
            <span className={`text-sm font-semibold ${text.ink}`}>Reminder runs</span>
            <p className="flex items-center gap-2 text-xs">
              <CalendarClock size={14} className="text-sky-600" aria-hidden="true" />
              <span className={text.muted}>Appointments:</span> <span className={text.ink}>{runText("appointment")}</span>
            </p>
            <p className="flex items-center gap-2 text-xs">
              <Syringe size={14} className="text-sky-600" aria-hidden="true" />
              <span className={text.muted}>Immunizations:</span> <span className={text.ink}>{runText("immunization")}</span>
            </p>
          </div>
        </div>
      </Panel>

      <TwoColumns>
        <Panel title="Online registrations to review" icon={Inbox} count={data.online_applications_pending} href="/settings/intake-applications" index={14}>
          <RowList>
            {data.recent_applications.length === 0 ? (
              <EmptyRow icon={Inbox}>No online registrations waiting.</EmptyRow>
            ) : (
              data.recent_applications.map((a) => (
                <li key={a.id}>
                  <Link href="/settings/intake-applications" className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-rose-50/40 focus-visible:bg-rose-50/40 focus-visible:outline-none">
                    <span className="min-w-0">
                      <span className={`block truncate font-semibold ${text.ink}`}>{a.applicant_name ?? a.reference_number}</span>
                      <span className={`block font-mono text-xs ${text.muted}`}>{a.reference_number}</span>
                    </span>
                    <Chip tone="sky">{formatDay(a.created_at)}</Chip>
                  </Link>
                </li>
              ))
            )}
          </RowList>
        </Panel>

        <Panel
          title="Security alerts (last hour)"
          icon={data.security_alerts.length ? ShieldAlert : ShieldCheck}
          tone={data.security_alerts.length ? "red" : "teal"}
          count={data.security_alerts.length}
          href="/settings/audit-log"
          linkLabel="Audit log"
          index={15}
        >
          <RowList>
            {data.security_alerts.length === 0 ? (
              <EmptyRow icon={ShieldCheck} hint="Failed sign-in bursts, record-viewing bursts and after-hours deletions show here.">No security alerts.</EmptyRow>
            ) : (
              data.security_alerts.map((a, i) => (
                <li key={`${a.check_name}-${i}`} className="flex items-start gap-3 px-5 py-3 text-sm">
                  <Chip icon={ShieldAlert} tone={a.severity === "HIGH" ? "red" : "amber"}>{a.severity}</Chip>
                  <span className={text.ink}>{a.detail}</span>
                </li>
              ))
            )}
          </RowList>
        </Panel>
      </TwoColumns>
    </>
  );
}
