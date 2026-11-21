"use client";

import Link from "next/link";
import type { AdminDashboardData, CheckStatus } from "@/types/dashboard";
import {
  DashboardHeader, EmptyRow, Panel, RowList, StatCard, StatGrid, TwoColumns,
  formatDay, formatTime,
} from "./shared";

// Admin model B: system, registrations and accounts only. Nothing clinical.

const STATUS_TEXT: Record<CheckStatus, string> = {
  ok: "All OK",
  warning: "Needs attention",
  error: "Problem",
  unknown: "Unknown",
};

const DOT: Record<CheckStatus, string> = {
  ok: "bg-green-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  unknown: "bg-slate-400",
};

function Dot({ status }: { status: CheckStatus }) {
  return <span aria-hidden="true" className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${DOT[status]}`} />;
}

export default function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const s = data.system;
  const run = (job: "appointment" | "immunization") => s.reliability.reminders.runs.find((r) => r.job === job);
  const runText = (job: "appointment" | "immunization") => {
    const r = run(job);
    if (!r?.last_run_at) return "not recorded yet";
    return `${formatDay(r.last_run_at)} ${formatTime(r.last_run_at)}${r.queued !== null ? ` · ${r.queued} SMS` : ""}`;
  };

  return (
    <>
      <DashboardHeader firstName={data.first_name} today={data.today} roleLabel="Administrator" />

      <StatGrid>
        <StatCard
          label="System"
          value={<span className="inline-flex items-center"><Dot status={s.overall} />{STATUS_TEXT[s.overall]}</span>}
          sub={`Version ${s.version.commit}`}
          href="/settings/system-health"
          tone={s.overall === "ok" ? "default" : "warning"}
        />
        <StatCard
          label="Registrations to review"
          value={data.online_applications_pending + data.previsit_forms_waiting}
          sub={`online ${data.online_applications_pending} · drafts ${data.previsit_forms_waiting}`}
          href="/registrations"
          emphasis
        />
        <StatCard
          label="Staff accounts"
          value={`${data.staff.active} active`}
          sub={`${data.staff.not_signed_in_30d} not signed in for 30+ days`}
          href="/settings/users"
        />
        <StatCard label="Active patients" value={data.active_patients} href="/patients" />
      </StatGrid>

      <Panel title="System health" href="/settings/system-health" linkLabel="Details" className="mb-6">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 px-5 py-4 text-sm sm:grid-cols-2">
          <div><dt className="inline text-slate-500">Database: </dt><dd className="inline"><Dot status={s.database.status} />{STATUS_TEXT[s.database.status]}</dd></div>
          <div><dt className="inline text-slate-500">Workers: </dt><dd className="inline"><Dot status={s.workers.status} />{s.workers.message}</dd></div>
          <div><dt className="inline text-slate-500">Backup: </dt><dd className="inline"><Dot status={s.backup.status} />{s.backup.message}</dd></div>
          <div>
            <dt className="inline text-slate-500">Disk: </dt>
            <dd className="inline"><Dot status={s.disk.status} />{s.disk.used_percent !== null ? `${Math.round(s.disk.used_percent)}% used` : STATUS_TEXT[s.disk.status]}</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">SMS (24 h): </dt>
            <dd className="inline"><Dot status={s.reliability.sms.status} />{s.reliability.sms.last_24h.sent} sent · {s.reliability.sms.last_24h.failed} failed</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">Sign-ins (24 h): </dt>
            <dd className="inline">
              <Dot status={s.reliability.sign_in.status} />
              {s.reliability.sign_in.last_24h.successful} · wrong passwords {s.reliability.sign_in.last_24h.failed_password} · wrong OTP {s.reliability.sign_in.last_24h.failed_otp}
            </dd>
          </div>
          <div><dt className="inline text-slate-500">Appointment reminders: </dt><dd className="inline">{runText("appointment")}</dd></div>
          <div><dt className="inline text-slate-500">Immunization reminders: </dt><dd className="inline">{runText("immunization")}</dd></div>
        </dl>
      </Panel>

      <TwoColumns>
        <Panel title="Online registrations to review" href="/settings/intake-applications">
          <RowList>
            {data.recent_applications.length === 0 ? (
              <EmptyRow>No online registrations waiting.</EmptyRow>
            ) : (
              data.recent_applications.map((a) => (
                <li key={a.id}>
                  <Link href="/settings/intake-applications" className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                    <span className="font-medium text-slate-900">{a.applicant_name ?? a.reference_number}</span>
                    <span className="text-slate-500">submitted {formatDay(a.created_at)}</span>
                  </Link>
                </li>
              ))
            )}
          </RowList>
        </Panel>

        <Panel title="Security alerts (last hour)" href="/settings/audit-log" linkLabel="Audit log">
          <RowList>
            {data.security_alerts.length === 0 ? (
              <EmptyRow>No security alerts.</EmptyRow>
            ) : (
              data.security_alerts.map((a, i) => (
                <li key={`${a.check_name}-${i}`} className="px-5 py-3 text-sm">
                  <span className={`mr-2 rounded px-1.5 text-xs font-semibold ${a.severity === "HIGH" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{a.severity}</span>
                  <span className="text-slate-900">{a.detail}</span>
                </li>
              ))
            )}
          </RowList>
        </Panel>
      </TwoColumns>
    </>
  );
}
