"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SystemInfo {
  bhc_name: string;
  environment: string;
  sms_provider: string;
  sms_reminder_lead_hours: number;
  sms_immunization_lead_days: number;
  nfc_view_base_url: string;
}

// ---------------------------------------------------------------------------
// Data hook
// ---------------------------------------------------------------------------

interface UseSystemInfoResult {
  data: SystemInfo | null;
  loading: boolean;
  error: string | null;
}

function useSystemInfo(): UseSystemInfoResult {
  const [data, setData] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFetch<SystemInfo>("/system/info");
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Failed to load system configuration."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionAccent() {
  return (
    <span
      className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]"
      aria-hidden="true"
    />
  );
}

interface ConfigCardProps {
  label: string;
  children: React.ReactNode;
}

function ConfigCard({ label, children }: ConfigCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-white border border-[#e5d4cc] px-5 py-4"
      style={{ boxShadow: "0 1px 6px rgba(160,80,80,0.06)" }}
    >
      <dt className="text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-[#1a0808]">{children}</dd>
    </div>
  );
}

interface EnvBadgeProps {
  value: string;
}

function EnvBadge({ value }: EnvBadgeProps) {
  const isProduction = value.toLowerCase() === "production";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        isProduction
          ? "bg-green-50 text-green-800 ring-green-600/20"
          : "bg-yellow-50 text-yellow-800 ring-yellow-600/20"
      }`}
    >
      {value.charAt(0).toUpperCase() + value.slice(1)}
    </span>
  );
}

const SMS_PROVIDER_LABELS: Record<string, string> = {
  semaphore: "Semaphore",
  itexmo: "iTExmo",
  philsms: "PhilSMS",
};

interface SmsProviderBadgeProps {
  value: string;
}

function SmsProviderBadge({ value }: SmsProviderBadgeProps) {
  const label = SMS_PROVIDER_LABELS[value.toLowerCase()] ?? value;
  return (
    <span className="inline-flex items-center rounded-md bg-[#fdf0eb] px-2.5 py-1 text-xs font-semibold text-[#b5343e] ring-1 ring-inset ring-[#edd9d0]">
      {label}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white border border-[#e5d4cc] px-5 py-4"
      style={{ boxShadow: "0 1px 6px rgba(160,80,80,0.06)" }}
    >
      <div className="h-3 w-24 animate-pulse rounded bg-[#f0ddd8]" />
      <div className="h-5 w-40 animate-pulse rounded bg-[#f5e8e4] mt-1" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { data, loading, error } = useSystemInfo();

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl leading-tight text-[#1a0808] font-display">
          System Configuration
        </h1>
        <p className="mt-1 text-sm font-medium text-[#7a5252]">
          Read-only — change values via environment variables
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800"
        >
          Could not load system configuration: {error}
        </div>
      )}

      {/* Card section */}
      <div
        className="overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        {/* Section header */}
        <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#fdf0eb] to-white border-b border-[#edd9d0]">
          <SectionAccent />
          <h2 className="text-sm font-bold text-[#1a0808]">
            Runtime Settings
          </h2>
          <span className="ml-auto text-xs text-[#c08080]">
            Source: environment variables
          </span>
        </div>

        {/* Config grid */}
        <div className="p-5">
          {loading ? (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </dl>
          ) : data ? (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ConfigCard label="Barangay Health Center">
                {data.bhc_name}
              </ConfigCard>

              <ConfigCard label="Environment">
                <EnvBadge value={data.environment} />
              </ConfigCard>

              <ConfigCard label="SMS Provider">
                <SmsProviderBadge value={data.sms_provider} />
              </ConfigCard>

              <ConfigCard label="Appointment Reminder Lead">
                {data.sms_reminder_lead_hours}{" "}
                {data.sms_reminder_lead_hours === 1 ? "hour" : "hours"} before
                appointment
              </ConfigCard>

              <ConfigCard label="Immunization Reminder Lead">
                {data.sms_immunization_lead_days}{" "}
                {data.sms_immunization_lead_days === 1 ? "day" : "days"} before
                due date
              </ConfigCard>

              <ConfigCard label="NFC Base URL">
                <span className="break-all font-mono text-xs">
                  {data.nfc_view_base_url}
                </span>
              </ConfigCard>
            </dl>
          ) : null}
        </div>
      </div>

      {/* Sub-section links */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <a
          href="/settings/users"
          className="flex items-center gap-3 rounded-xl border border-[#e5d4cc] bg-white px-5 py-4 text-sm font-medium text-[#1a0808] transition-colors hover:border-[#c08080] hover:bg-[#fdf0eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5343e] focus-visible:ring-offset-2"
          style={{ boxShadow: "0 1px 6px rgba(160,80,80,0.06)" }}
        >
          <IconUsers />
          <div>
            <p className="font-semibold">Staff Accounts</p>
            <p className="text-xs text-[#9b6e6e]">Manage BHW, physician, and admin staff users</p>
          </div>
          <IconChevronRight className="ml-auto shrink-0 text-[#c08080]" />
        </a>

        <a
          href="/settings/audit-log"
          className="flex items-center gap-3 rounded-xl border border-[#e5d4cc] bg-white px-5 py-4 text-sm font-medium text-[#1a0808] transition-colors hover:border-[#c08080] hover:bg-[#fdf0eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b5343e] focus-visible:ring-offset-2"
          style={{ boxShadow: "0 1px 6px rgba(160,80,80,0.06)" }}
        >
          <IconAudit />
          <div>
            <p className="font-semibold">Audit Log</p>
            <p className="text-xs text-[#9b6e6e]">Immutable trail of all sensitive system actions</p>
          </div>
          <IconChevronRight className="ml-auto shrink-0 text-[#c08080]" />
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconUsers() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-[#b5343e]"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconAudit() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-[#b5343e]"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
