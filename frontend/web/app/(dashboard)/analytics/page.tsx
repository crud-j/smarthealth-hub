"use client";

import Link from "next/link";
import React from "react";
import { useVaccinationCoverage, useDashboardOverview, useVisitTrends } from "@/hooks/useAnalytics";
import VaccinationCoverageChart from "@/components/charts/VaccinationCoverageChart";
import PatientVisitsChart from "@/components/charts/PatientVisitsChart";
import PatientDemographicsChart from "@/components/charts/PatientDemographicsChart";
import AnomalyAlertBanner from "@/components/analytics/AnomalyAlertBanner";
import NoShowRiskPanel from "@/components/analytics/NoShowRiskPanel";
import { useNoShowRisk, useAnomalyAlerts } from "@/hooks/useAiAnalytics";
import { useVisitTypeBreakdown } from "@/hooks/useAnalytics";
import VisitTypeBreakdownChart from "@/components/charts/VisitTypeBreakdownChart";

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  loading?: boolean;
  href?: string;
}

function KpiCard({ label, value, icon, loading, href }: KpiCardProps) {
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-500">
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="mt-4 h-9 w-20 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />
      ) : (
        <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
          {value.toLocaleString()}
        </p>
      )}
    </>
  );

  const base = "flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow";

  if (href) {
    return (
      <Link href={href} className={`${base} hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600`}>
        {inner}
      </Link>
    );
  }

  return <div className={base}>{inner}</div>;
}

// ---------------------------------------------------------------------------
// Chart wrapper
// ---------------------------------------------------------------------------

function ChartCard({ title, subtitle, badge, action, children }: {
  title: string;
  subtitle: string;
  badge?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="ml-4 flex shrink-0 items-center gap-3">
          {badge && (
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
              {badge}
            </span>
          )}
          {action && (
            <Link
              href={action.href}
              className="text-sm font-medium text-rose-600 hover:text-rose-500 focus-visible:outline-none focus-visible:underline"
            >
              {action.label}
            </Link>
          )}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-page nav card
// ---------------------------------------------------------------------------

function SubPageCard({ href, title, description, icon }: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-150 hover:border-slate-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-colors duration-150 group-hover:border-rose-200 group-hover:bg-rose-50 group-hover:text-rose-600">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-400 transition-colors duration-150 group-hover:border-rose-100 group-hover:text-rose-500">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9,18 15,12 9,6" />
        </svg>
      </div>
    </Link>
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

      {/* Header */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Analytics</h1>
          <p className="mt-2 text-sm text-slate-500">Health center metrics and real-time data.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Live
        </div>
      </header>

      {/* KPI grid */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
        <KpiCard
          label="Total Active Patients"
          value={overviewData?.totalActivePatients ?? 0}
          loading={overviewLoading}
          href="/patients"
          icon={
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <KpiCard
          label="Visits This Week"
          value={overviewData?.visitsThisWeek ?? 0}
          loading={overviewLoading}
          icon={
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
        />
        <KpiCard
          label="Immunizations Due"
          value={overviewData?.immunizationsDue ?? 0}
          loading={overviewLoading}
          href="/immunizations"
          icon={
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          }
        />
        <KpiCard
          label="Upcoming Appointments"
          value={overviewData?.upcomingAppointments ?? 0}
          loading={overviewLoading}
          href="/appointments"
          icon={
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
            </svg>
          }
        />
      </section>

      {/* Charts — 2 col */}
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          title="Patient Visits"
          subtitle="Week-by-week visit counts for the last 12 weeks"
          badge="12 weeks"
        >
          <PatientVisitsChart points={visitTrends ?? []} loading={trendsLoading} />
        </ChartCard>
        <ChartCard
          title="Vaccination Coverage"
          subtitle="Completion rate by vaccine, color-coded by threshold"
          badge="By vaccine"
        >
          <VaccinationCoverageChart items={coverageData?.byVaccine ?? []} loading={coverageLoading} />
        </ChartCard>
      </div>

      {/* Visit type breakdown — full width */}
      <div className="mb-5">
        <ChartCard
          title="Visit Type Breakdown"
          subtitle="Distribution of visit categories in the last 30 days"
          badge="Last 30 days"
        >
          <VisitTypeBreakdownChart
            items={visitTypeData?.items ?? []}
            loading={visitTypeLoading}
          />
        </ChartCard>
      </div>

      {/* Demographics — full width */}
      <div className="mb-5">
        <ChartCard
          title="Patient Demographics"
          subtitle="Priority group breakdown of all active patients"
          badge="Active patients"
        >
          <PatientDemographicsChart
            totalActivePatients={overviewData?.totalActivePatients ?? 0}
            seniorCount={overviewData?.seniorCount ?? 0}
            pwdCount={overviewData?.pwdCount ?? 0}
            pregnantCount={overviewData?.pregnantCount ?? 0}
            loading={overviewLoading}
          />
        </ChartCard>
      </div>

      {/* AI Follow-up */}
      <div className="mb-10">
        <ChartCard
          title="Priority Follow-Up"
          subtitle="AI-prioritized appointments needing attention in the next 7 days"
          badge="AI-powered"
          action={{ href: "/analytics/ai", label: "Full report" }}
        >
          <NoShowRiskPanel data={noShowRiskData} loading={noShowRiskLoading} />
        </ChartCard>
      </div>

      {/* Explore section */}
      <section aria-label="Explore analytics">
        <div className="mb-4 flex items-center gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Explore</h2>
          <div className="flex-1 border-t border-slate-200" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SubPageCard
            href="/analytics/illness-trends"
            title="Illness Trends"
            description="Diagnosis frequency trends over custom date ranges"
            icon={
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
              </svg>
            }
          />
          <SubPageCard
            href="/analytics/reports"
            title="Export Reports"
            description="Download CSV or JSON reports for LGU/DOH submission"
            icon={
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            }
          />
        </div>
      </section>
    </main>
  );
}
