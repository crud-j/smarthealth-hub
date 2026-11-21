"use client";

import Link from "next/link";
import React from "react";
import {
  Activity, ArrowRight, CalendarClock, CalendarDays, Download, Syringe, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useDashboardOverview, useVaccinationCoverage, useVisitTrends, useVisitTypeBreakdown,
} from "@/hooks/useAnalytics";
import { useAnomalyAlerts, useNoShowRisk } from "@/hooks/useAiAnalytics";
import VaccinationCoverageChart from "@/components/charts/VaccinationCoverageChart";
import PatientVisitsChart from "@/components/charts/PatientVisitsChart";
import PatientDemographicsChart from "@/components/charts/PatientDemographicsChart";
import VisitTypeBreakdownChart from "@/components/charts/VisitTypeBreakdownChart";
import AnomalyAlertBanner from "@/components/analytics/AnomalyAlertBanner";
import NoShowRiskPanel from "@/components/analytics/NoShowRiskPanel";
import ReminderEffectCard from "@/components/analytics/ReminderEffectCard";

/**
 * Analytics overview.
 *
 * Layout (top to bottom): header with the two tools people come here for
 * (Export reports, Illness trends), then four plainly named sections:
 *   At a glance · Visits · Patients · Reminders and follow-up
 * Every card says which period it covers. Same warm theme as the dashboards.
 */

const INK = "text-[#2a1414]";
const MUTED = "text-[#8a6a6a]";
const CARD = "rounded-2xl border border-[#eadbd3] bg-white shadow-[0_1px_2px_rgba(60,20,20,0.04),0_8px_24px_-12px_rgba(120,40,40,0.12)]";

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({ id, title, intro, children }: { id: string; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-10">
      <div className="mb-4">
        <h2 id={id} className={`font-display text-2xl leading-tight ${INK}`}>{title}</h2>
        <p className={`mt-0.5 text-sm ${MUTED}`}>{intro}</p>
      </div>
      {children}
    </section>
  );
}

function Period({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fdf0eb] px-2.5 py-0.5 text-xs font-medium text-[#8a3a3a] ring-1 ring-inset ring-[#f1d9cf]">
      <CalendarDays size={12} aria-hidden="true" />
      {children}
    </span>
  );
}

function ChartCard({ title, subtitle, period, action, children }: {
  title: string;
  subtitle: string;
  period: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col overflow-hidden ${CARD}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#f1e6e0] px-5 py-4">
        <div className="min-w-0">
          <h3 className={`text-base font-semibold ${INK}`}>{title}</h3>
          <p className={`mt-0.5 text-sm ${MUTED}`}>{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <Period>{period}</Period>
          {action && (
            <Link href={action.href} className="inline-flex items-center gap-1 text-sm font-medium text-rose-600 hover:text-rose-700 focus-visible:underline focus-visible:outline-none">
              {action.label} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      <div className="flex-1 p-5">{children}</div>
    </div>
  );
}

function KpiCard({ label, period, value, icon: Icon, loading, href }: {
  label: string;
  period: string;
  value: number;
  icon: LucideIcon;
  loading?: boolean;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-semibold ${INK}`}>{label}</p>
          <p className={`text-xs ${MUTED}`}>{period}</p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100" aria-hidden="true">
          <Icon size={18} />
        </span>
      </div>
      {loading ? (
        <div className="mt-4 h-9 w-20 animate-pulse rounded-lg bg-stone-100" aria-hidden="true" />
      ) : (
        <p className={`mt-3 font-display text-3xl leading-none tabular-nums sm:mt-4 sm:text-4xl ${INK}`}>{value.toLocaleString()}</p>
      )}
    </>
  );
  const base = `flex flex-col p-4 sm:p-5 ${CARD}`;
  return href ? (
    <Link href={href} className={`${base} transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600`}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const { data: coverageData, loading: coverageLoading } = useVaccinationCoverage();
  const { data: overviewData, loading: overviewLoading } = useDashboardOverview();
  const { data: visitTrends, loading: trendsLoading } = useVisitTrends(12);
  const { data: noShowRiskData, loading: noShowRiskLoading } = useNoShowRisk(10);
  const { data: anomalyAlertsData, loading: anomalyAlertsLoading } = useAnomalyAlerts();
  const { data: visitTypeData, loading: visitTypeLoading } = useVisitTypeBreakdown();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <AnomalyAlertBanner data={anomalyAlertsData} loading={anomalyAlertsLoading} />

      {/* Header: the two tools people come here for, first. */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={`font-display text-3xl leading-tight sm:text-4xl ${INK}`}>Analytics</h1>
          <p className={`mt-1 text-sm ${MUTED}`}>
            How the health center is doing: visits, patients, vaccinations and reminders.
          </p>
        </div>
        <nav aria-label="Analytics tools" className="flex flex-wrap gap-2">
          <Link
            href="/analytics/illness-trends"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#eadbd3] bg-white px-4 text-sm font-semibold text-[#2a1414] shadow-sm hover:bg-[#fdf7f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
          >
            <Activity size={16} aria-hidden="true" /> Illness trends
          </Link>
          <Link
            href="/analytics/reports"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#b5343e] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#9c2a33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
          >
            <Download size={16} aria-hidden="true" /> Export reports
          </Link>
        </nav>
      </header>

      <Section id="sec-glance" title="At a glance" intro="Current totals. Tap a card to open the list behind it.">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <KpiCard label="Active patients" period="Right now" value={overviewData?.totalActivePatients ?? 0} loading={overviewLoading} href="/patients" icon={Users} />
          <KpiCard label="Visits" period="This week, since Monday" value={overviewData?.visitsThisWeek ?? 0} loading={overviewLoading} icon={CalendarDays} />
          <KpiCard label="Immunizations due" period="Next 7 days" value={overviewData?.immunizationsDue ?? 0} loading={overviewLoading} href="/immunizations" icon={Syringe} />
          <KpiCard label="Upcoming appointments" period="Scheduled from today on" value={overviewData?.upcomingAppointments ?? 0} loading={overviewLoading} href="/appointments" icon={CalendarClock} />
        </div>
      </Section>

      <Section id="sec-visits" title="Visits" intro="How many patients came, and for what kind of visit.">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ChartCard title="Patient visits per week" subtitle="Visits logged each week" period="Last 12 weeks">
            <PatientVisitsChart points={visitTrends ?? []} loading={trendsLoading} />
          </ChartCard>
          <ChartCard title="Visit types" subtitle="Consultation, prenatal, immunization and other visits" period="Last 30 days">
            <VisitTypeBreakdownChart items={visitTypeData?.items ?? []} loading={visitTypeLoading} />
          </ChartCard>
        </div>
      </Section>

      <Section id="sec-patients" title="Patients" intro="Who the health center serves, and how well they are vaccinated.">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <ChartCard title="Priority groups" subtitle="Seniors, persons with disability and pregnant patients" period="All active patients">
            <PatientDemographicsChart
              totalActivePatients={overviewData?.totalActivePatients ?? 0}
              seniorCount={overviewData?.seniorCount ?? 0}
              pwdCount={overviewData?.pwdCount ?? 0}
              pregnantCount={overviewData?.pregnantCount ?? 0}
              loading={overviewLoading}
            />
          </ChartCard>
          <ChartCard title="Vaccination coverage" subtitle="Share of doses completed, per vaccine" period="All records">
            <VaccinationCoverageChart items={coverageData?.byVaccine ?? []} loading={coverageLoading} />
          </ChartCard>
        </div>
      </Section>

      <Section id="sec-followup" title="Reminders and follow-up" intro="Whether SMS reminders bring patients in, and who may miss their next appointment.">
        <div className="grid grid-cols-1 gap-5">
          <ReminderEffectCard />
          <ChartCard
            title="Patients who may miss their appointment"
            subtitle="Ranked by the AI no-show risk score, highest first"
            period="Next 7 days"
            action={{ href: "/analytics/ai", label: "Full report" }}
          >
            <NoShowRiskPanel data={noShowRiskData} loading={noShowRiskLoading} />
          </ChartCard>
        </div>
      </Section>
    </main>
  );
}
