"use client";

/**
 * Analytics main page — Phase 5.
 *
 * Premium redesign: Stripe/Linear/Vercel-quality layout with layered depth,
 * gradient header panel, KPI cards with icon blobs and bottom accent stripes,
 * ChartCards with colored top stripes, and gradient SubPageCards.
 *
 * Visual-only upgrade — no data hooks, API calls, or prop interfaces changed.
 */

import Link from "next/link";
import React from "react";
import {
  useVaccinationCoverage,
  useDashboardOverview,
  useVisitTrends,
} from "@/hooks/useAnalytics";
import VaccinationCoverageChart from "@/components/charts/VaccinationCoverageChart";
import PatientVisitsChart from "@/components/charts/PatientVisitsChart";
import PatientDemographicsChart from "@/components/charts/PatientDemographicsChart";
import AnomalyAlertBanner from "@/components/analytics/AnomalyAlertBanner";
import NoShowRiskPanel from "@/components/analytics/NoShowRiskPanel";
import { useNoShowRisk, useAnomalyAlerts } from "@/hooks/useAiAnalytics";

// ---------------------------------------------------------------------------
// KPI stat card — layered depth, radial blob, bottom accent stripe
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string;
  value: number;
  iconColor: string;
  icon: React.ReactNode;
  loading?: boolean;
}

function KpiCard({ label, value, iconColor, icon, loading }: KpiCardProps) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 20,
      padding: "24px 24px 20px",
      border: "1px solid rgba(0,0,0,0.06)",
      boxShadow: "0 0 0 1px rgba(0,0,0,0.02), 0 8px 24px rgba(0,0,0,0.06)",
      position: "relative",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      gap: 0,
    }}>
      {/* Decorative radial gradient blob top-right */}
      <div style={{
        position: "absolute", top: -32, right: -32,
        width: 112, height: 112, borderRadius: "50%",
        background: `radial-gradient(circle, ${iconColor}22 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* Icon box */}
      <div style={{
        width: 44, height: 44, borderRadius: 13,
        background: `linear-gradient(135deg, ${iconColor}28 0%, ${iconColor}0e 100%)`,
        border: `1px solid ${iconColor}28`,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 18, flexShrink: 0,
      }}>
        {icon}
      </div>

      {/* Value */}
      {loading ? (
        <div style={{ height: 40, width: 88, borderRadius: 10, background: "#f1f5f9", marginBottom: 8 }} />
      ) : (
        <div style={{
          fontSize: 36, fontWeight: 800, color: "#0f172a",
          letterSpacing: "-0.04em", lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          marginBottom: 8,
        }}>
          {value.toLocaleString()}
        </div>
      )}

      {/* Label */}
      {loading ? (
        <div style={{ height: 14, width: 120, borderRadius: 6, background: "#f1f5f9" }} />
      ) : (
        <div style={{ fontSize: 13, color: "#64748b", fontWeight: 500, lineHeight: 1.35 }}>
          {label}
        </div>
      )}

      {/* Bottom accent stripe */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${iconColor} 0%, ${iconColor}40 100%)`,
        borderRadius: "0 0 20px 20px",
      }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart wrapper card — colored top stripe replaces decorative dot
// ---------------------------------------------------------------------------

function ChartCard({
  title, subtitle, accentColor, badge, action, children,
}: {
  title: string;
  subtitle: string;
  accentColor: string;
  badge?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 20,
      border: "1px solid rgba(0,0,0,0.06)",
      boxShadow: "0 0 0 1px rgba(0,0,0,0.02), 0 8px 24px rgba(0,0,0,0.06)",
      overflow: "hidden",
    }}>
      {/* Top accent stripe */}
      <div style={{
        height: 3,
        background: `linear-gradient(90deg, ${accentColor} 0%, ${accentColor}40 100%)`,
      }} />

      <div style={{ padding: "20px 24px 24px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h2 style={{
              fontSize: 15, fontWeight: 700, color: "#0f172a",
              margin: "0 0 4px", letterSpacing: "-0.01em",
            }}>
              {title}
            </h2>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, lineHeight: 1.4 }}>{subtitle}</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 12 }}>
            {badge && (
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: accentColor,
                background: `${accentColor}12`,
                border: `1px solid ${accentColor}28`,
                borderRadius: 8, padding: "4px 10px",
                letterSpacing: "0.01em",
              }}>
                {badge}
              </span>
            )}
            {action && (
              <Link href={action.href} style={{
                fontSize: 12, color: "#94a3b8", textDecoration: "none",
                fontWeight: 500, whiteSpace: "nowrap",
              }}>
                {action.label} →
              </Link>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-page navigation card — gradient action card
// ---------------------------------------------------------------------------

function SubPageCard({
  href, title, description, icon,
}: {
  href: string; title: string; description: string; icon: React.ReactNode;
}) {
  return (
    <Link href={href} style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "18px 22px",
      background: "linear-gradient(135deg, #fdf5f5 0%, #fff8f8 50%, #ffffff 100%)",
      borderRadius: 16,
      border: "1px solid rgba(181,52,62,0.12)",
      boxShadow: "0 1px 4px rgba(181,52,62,0.06), 0 0 0 1px rgba(181,52,62,0.03)",
      textDecoration: "none",
      transition: "box-shadow 0.15s",
    }}>
      {/* Icon bubble */}
      <div style={{
        width: 48, height: 48, borderRadius: 14, flexShrink: 0,
        background: "linear-gradient(135deg, #b5343e22 0%, #b5343e0a 100%)",
        border: "1px solid #b5343e22",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 3px", letterSpacing: "-0.01em" }}>
          {title}
        </p>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, lineHeight: 1.4 }}>
          {description}
        </p>
      </div>

      {/* Arrow in a pill */}
      <div style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: "#fff",
        border: "1px solid rgba(181,52,62,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#b5343e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

  return (
    <div style={{ minHeight: "100vh" }}>

      <AnomalyAlertBanner data={anomalyAlertsData} loading={anomalyAlertsLoading} />

      {/* ── Gradient header panel ─────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, rgba(181,52,62,0.07) 0%, rgba(181,52,62,0.02) 45%, rgba(255,255,255,0) 100%)",
        borderRadius: 20,
        padding: "28px 32px",
        border: "1px solid rgba(181,52,62,0.09)",
        marginBottom: 24,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 16,
        position: "relative", overflow: "hidden",
      }}>
        {/* Subtle decorative arcs top-right */}
        <div style={{
          position: "absolute", top: -60, right: -60,
          width: 200, height: 200, borderRadius: "50%",
          border: "1px solid rgba(181,52,62,0.06)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: -30, right: -30,
          width: 120, height: 120, borderRadius: "50%",
          border: "1px solid rgba(181,52,62,0.06)",
          pointerEvents: "none",
        }} />

        <div>
          <h1 style={{
            fontSize: 28, fontWeight: 800, color: "#0f172a",
            letterSpacing: "-0.03em", margin: 0, lineHeight: 1.1,
          }}>
            Analytics
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 6, margin: "6px 0 0" }}>
            Health center metrics · Real-time data
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>Updated just now</span>
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "7px 14px",
            background: "rgba(22,163,74,0.08)",
            border: "1px solid rgba(22,163,74,0.2)",
            borderRadius: 20, fontSize: 12, color: "#16a34a", fontWeight: 700,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", background: "#16a34a",
              display: "inline-block",
              boxShadow: "0 0 0 3px rgba(22,163,74,0.2)",
            }} />
            Live
          </div>
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 24 }}>
        <KpiCard
          label="Total Active Patients"
          value={overviewData?.totalActivePatients ?? 0}
          iconColor="#b5343e"
          loading={overviewLoading}
          icon={
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#b5343e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <KpiCard
          label="Visits This Week"
          value={overviewData?.visitsThisWeek ?? 0}
          iconColor="#0284c7"
          loading={overviewLoading}
          icon={
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
        />
        <KpiCard
          label="Immunizations Due"
          value={overviewData?.immunizationsDue ?? 0}
          iconColor="#16a34a"
          loading={overviewLoading}
          icon={
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          }
        />
        <KpiCard
          label="Upcoming Appointments"
          value={overviewData?.upcomingAppointments ?? 0}
          iconColor="#d97706"
          loading={overviewLoading}
          icon={
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
            </svg>
          }
        />
      </div>

      {/* ── Charts 2-column grid ───────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 20, marginBottom: 20 }}>
        <ChartCard
          title="Patient Visits"
          subtitle="Week-by-week visit counts for the last 12 weeks"
          accentColor="#0d9488"
          badge="12 weeks"
        >
          <PatientVisitsChart points={visitTrends ?? []} loading={trendsLoading} />
        </ChartCard>

        <ChartCard
          title="Vaccination Coverage"
          subtitle="Completion rate by vaccine — color-coded by threshold"
          accentColor="#b5343e"
          badge="By vaccine"
        >
          <VaccinationCoverageChart items={coverageData?.byVaccine ?? []} loading={coverageLoading} />
        </ChartCard>
      </div>

      {/* ── Demographics full-width ───────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <ChartCard
          title="Patient Demographics"
          subtitle="Priority group breakdown of all active patients"
          accentColor="#d97706"
          badge="Active patients"
        >
          <PatientDemographicsChart
            totalActivePatients={overviewData?.totalActivePatients ?? 0}
            seniorCount={0}
            pwdCount={0}
            pregnantCount={0}
            loading={overviewLoading}
          />
        </ChartCard>
      </div>

      {/* ── AI Priority Follow-Up ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <ChartCard
          title="Priority Follow-Up"
          subtitle="AI-prioritized appointments needing attention in the next 7 days"
          accentColor="#7c3aed"
          badge="AI-powered"
        >
          <NoShowRiskPanel data={noShowRiskData} loading={noShowRiskLoading} />
        </ChartCard>
      </div>

      {/* ── Explore section ───────────────────────────────────────────────── */}
      <div>
        <div style={{
          display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            Explore
          </span>
          <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.06)" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          <SubPageCard
            href="/analytics/illness-trends"
            title="Illness Trends"
            description="Diagnosis frequency trends over custom date ranges"
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#b5343e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
              </svg>
            }
          />
          <SubPageCard
            href="/analytics/reports"
            title="Export Reports"
            description="Download CSV or JSON reports for LGU/DOH submission"
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#b5343e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            }
          />
        </div>
      </div>
    </div>
  );
}
