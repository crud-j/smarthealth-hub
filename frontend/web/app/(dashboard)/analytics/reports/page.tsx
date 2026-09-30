"use client";

import Link from "next/link";
import { useState } from "react";
import { useAnalyticsExport } from "@/hooks/useAnalytics";
import { useWebWorker } from "@/hooks/useWebWorker";
import type { CsvExportApi } from "@/workers/csvExport.worker";
import type { ExportReportType, ExportFormat } from "@/types/analytics";

// ---------------------------------------------------------------------------
// Sync CSV fallback
// ---------------------------------------------------------------------------

function toCsvSync(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\r\n");
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPORT_TYPES: { value: ExportReportType; label: string; description: string }[] = [
  { value: "patients",       label: "Patients",              description: "Active patient demographics and codes" },
  { value: "visits",         label: "Visits",                description: "Consultation and diagnosis records" },
  { value: "immunizations",  label: "Immunizations",         description: "Vaccination schedules and status" },
  { value: "appointments",   label: "Appointments",          description: "Scheduled and historical appointments" },
];

const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500";
const labelCls = "mb-1.5 block text-sm font-medium text-slate-700";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ExportReportType>("patients");
  const [format,     setFormat]     = useState<ExportFormat>("csv");
  const [fromDate,   setFromDate]   = useState("");
  const [toDate,     setToDate]     = useState("");
  const [processing, setProcessing] = useState(false);
  const [exportError, setExportError] = useState("");

  const { fetchExportData, loading } = useAnalyticsExport();

  const csvWorker = useWebWorker<CsvExportApi>(() =>
    new Worker(new URL("../../../../workers/csvExport.worker.ts", import.meta.url), { type: "module" })
  );

  async function handleExport() {
    setExportError(""); setProcessing(true);
    try {
      const rows = await fetchExportData({ reportType, from: fromDate || undefined, to: toDate || undefined, format });
      if (rows.length === 0) { setExportError("No data found for the selected filters."); return; }
      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `smarthealthhub_${reportType}_${timestamp}`;
      if (format === "json") {
        downloadBlob(JSON.stringify(rows, null, 2), `${filename}.json`, "application/json");
      } else {
        const csvContent = csvWorker ? await csvWorker.toCsv(rows) : toCsvSync(rows);
        downloadBlob(csvContent, `${filename}.csv`, "text/csv;charset=utf-8;");
      }
    } catch { setExportError("Export failed. Please try again."); }
    finally { setProcessing(false); }
  }

  const isBusy = loading || processing;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/analytics"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:underline"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12,19 5,12 12,5" />
          </svg>
          Back to Analytics
        </Link>
      </div>

      {/* Page heading */}
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Export Reports</h1>
        <p className="mt-2 text-sm text-slate-500">Generate downloadable data reports for LGU/DOH submission.</p>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Export Configuration</h2>
        </div>

        <div className="space-y-7 p-6">

          {/* Error */}
          {exportError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
              {exportError}
            </div>
          )}

          {/* Report type */}
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-slate-900">Report type</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REPORT_TYPES.map((t) => {
                const isSelected = reportType === t.value;
                return (
                  <label
                    key={t.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-all ${
                      isSelected
                        ? "border-rose-600 bg-rose-50 ring-1 ring-inset ring-rose-600/20"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="report-type"
                      value={t.value}
                      checked={isSelected}
                      onChange={() => setReportType(t.value)}
                      className="sr-only"
                    />
                    <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isSelected ? "border-rose-600 bg-rose-600" : "border-slate-300"
                    }`}>
                      {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${isSelected ? "text-rose-800" : "text-slate-900"}`}>{t.label}</p>
                      <p className={`text-xs ${isSelected ? "text-rose-600" : "text-slate-500"}`}>{t.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rpt-from" className={labelCls}>
                From <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input id="rpt-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="rpt-to" className={labelCls}>
                To <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input id="rpt-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Format */}
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-slate-900">Format</legend>
            <div className="flex gap-2">
              {(["csv", "json"] as ExportFormat[]).map((f) => {
                const isSelected = format === f;
                return (
                  <label
                    key={f}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border px-5 text-sm font-semibold transition-all ${
                      isSelected
                        ? "border-rose-600 bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="export-format"
                      value={f}
                      checked={isSelected}
                      onChange={() => setFormat(f)}
                      className="sr-only"
                    />
                    {f === "csv" ? (
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" />
                        <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="16,18 22,12 16,6" /><polyline points="8,6 2,12 8,18" />
                      </svg>
                    )}
                    {f.toUpperCase()}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Export button */}
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isBusy}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-rose-700 disabled:opacity-60 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
          >
            {isBusy ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                {processing ? "Generating file…" : "Fetching data…"}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export {format.toUpperCase()}
              </>
            )}
          </button>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Large exports are processed client-side for privacy — your data never leaves your browser for formatting.
      </p>
    </main>
  );
}
