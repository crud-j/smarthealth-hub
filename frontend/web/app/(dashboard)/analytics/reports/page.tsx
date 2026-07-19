"use client";

/**
 * Analytics Reports / Export Center — Phase 5.
 *
 * Features:
 *  - Report type selector: Patients / Visits / Immunizations / Appointments
 *  - Date range picker
 *  - Format toggle: CSV / JSON
 *  - "Export" button → fetches data from GET /analytics/export → triggers download
 *  - For CSV: uses csvExport.worker.ts for client-side formatting (SDP §7.4)
 *    with a synchronous fallback when Worker is unavailable.
 *  - Loading state on the Export button while processing.
 */

import Link from "next/link";
import { useState } from "react";
import { useAnalyticsExport } from "@/hooks/useAnalytics";
import { useWebWorker } from "@/hooks/useWebWorker";
import type { CsvExportApi } from "@/workers/csvExport.worker";
import type { ExportReportType, ExportFormat } from "@/types/analytics";

// ---------------------------------------------------------------------------
// Synchronous CSV fallback (used when Worker is unavailable)
// ---------------------------------------------------------------------------

function toCsvSync(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [
    headers.map(escape).join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\r\n");
}

// ---------------------------------------------------------------------------
// Trigger a download in the browser
// ---------------------------------------------------------------------------

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPORT_TYPES: { value: ExportReportType; label: string }[] = [
  { value: "patients", label: "Patients" },
  { value: "visits", label: "Visits / Consultations" },
  { value: "immunizations", label: "Immunizations" },
  { value: "appointments", label: "Appointments" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ExportReportType>("patients");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [processing, setProcessing] = useState(false);
  const [exportError, setExportError] = useState("");

  const { fetchExportData, loading } = useAnalyticsExport();

  // csvExport.worker.ts for off-thread CSV formatting (SDP §7.4.1)
  const csvWorker = useWebWorker<CsvExportApi>(
    new URL("../../../../workers/csvExport.worker.ts", import.meta.url)
  );

  async function handleExport() {
    setExportError("");
    setProcessing(true);

    try {
      const rows = await fetchExportData({
        reportType,
        from: fromDate || undefined,
        to: toDate || undefined,
        format,
      });

      if (rows.length === 0) {
        setExportError("No data found for the selected filters.");
        return;
      }

      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `smarthealthhub_${reportType}_${timestamp}`;

      if (format === "json") {
        downloadBlob(
          JSON.stringify(rows, null, 2),
          `${filename}.json`,
          "application/json"
        );
      } else {
        // CSV — use worker if available, fall back to sync
        let csvContent: string;
        if (csvWorker) {
          csvContent = await csvWorker.toCsv(rows);
        } else {
          csvContent = toCsvSync(rows);
        }
        downloadBlob(csvContent, `${filename}.csv`, "text/csv;charset=utf-8;");
      }
    } catch {
      setExportError("Export failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  const isBusy = loading || processing;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Back link */}
      <div className="mb-4">
        <Link href="/analytics" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-800">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12,19 5,12 12,5" />
          </svg>
          Back to Analytics
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Export Reports</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Generate downloadable data reports for LGU/DOH submission
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {exportError && (
          <div className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
            {exportError}
          </div>
        )}

        <div className="space-y-5">
          {/* Report type */}
          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-slate-700">
              Report type
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {REPORT_TYPES.map((t) => (
                <label
                  key={t.value}
                  className={[
                    "flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    reportType === t.value
                      ? "border-teal-600 bg-teal-50 text-teal-700"
                      : "border-slate-200 text-slate-600 hover:border-teal-300 hover:bg-teal-50",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="report-type"
                    value={t.value}
                    checked={reportType === t.value}
                    onChange={() => setReportType(t.value)}
                    className="sr-only"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rpt-from" className="mb-1.5 block text-sm font-medium text-slate-700">
                From <span className="text-xs font-normal text-slate-400">(optional)</span>
              </label>
              <input id="rpt-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label htmlFor="rpt-to" className="mb-1.5 block text-sm font-medium text-slate-700">
                To <span className="text-xs font-normal text-slate-400">(optional)</span>
              </label>
              <input id="rpt-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>

          {/* Format */}
          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-slate-700">Format</legend>
            <div className="flex gap-3">
              {(["csv", "json"] as ExportFormat[]).map((f) => (
                <label
                  key={f}
                  className={[
                    "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                    format === f
                      ? "border-teal-600 bg-teal-50 text-teal-700"
                      : "border-slate-200 text-slate-600 hover:border-teal-300 hover:bg-teal-50",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="export-format"
                    value={f}
                    checked={format === f}
                    onChange={() => setFormat(f)}
                    className="sr-only"
                  />
                  {f.toUpperCase()}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Export button */}
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isBusy}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-60"
          >
            {isBusy ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                {processing ? "Generating file…" : "Fetching data…"}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7,10 12,15 17,10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export {format.toUpperCase()}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Info note */}
      <p className="mt-4 text-xs text-slate-400">
        Large exports are processed client-side for privacy — your data never
        leaves your browser for formatting.
      </p>
    </div>
  );
}
