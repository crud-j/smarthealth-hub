"use client";

import { useState, useEffect, useCallback } from "react";
import { Download } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api-client";

interface AuditLogEntry {
  id: string; user_id: string | null; user_email?: string | null; action: string;
  entity_type: string; entity_id: string | null; metadata: Record<string, unknown>;
  ip_address: string | null; created_at: string;
}

interface PaginatedAuditLogs { items: AuditLogEntry[]; total: number; page: number; page_size: number; }

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  UPDATE: "bg-blue-100 text-blue-700 border border-blue-200",
  DELETE: "bg-red-100 text-red-700 border border-red-200",
  VIEW: "bg-stone-100 text-stone-600 border border-stone-200",
  VIEW_PHI: "bg-amber-100 text-amber-700 border border-amber-200",
  LOGIN: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  LOGOUT: "bg-stone-100 text-stone-500 border border-stone-200",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "VIEW", "VIEW_PHI", "LOGIN", "LOGOUT"];
const PAGE_SIZE = 20;

export default function AuditLogPage() {
  const [data, setData] = useState<PaginatedAuditLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState({ action: "", from: "", to: "" });

  const fetchLogs = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (applied.action) qs.set("action", applied.action);
      if (applied.from) qs.set("date_from", applied.from);
      if (applied.to) qs.set("date_to", applied.to);
      const raw = await apiFetch<PaginatedAuditLogs>(`/audit-logs?${qs.toString()}`);
      setData(raw);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load audit logs.");
    } finally { setLoading(false); }
  }, [page, applied]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  function handleApply() { setPage(1); setApplied({ action: actionFilter, from: dateFrom, to: dateTo }); }

  async function handleExportCsv() {
    setExporting(true);
    setExportError("");
    try {
      const qs = new URLSearchParams();
      if (applied.action) qs.set("action", applied.action);
      if (applied.from) qs.set("date_from", applied.from);
      if (applied.to) qs.set("date_to", applied.to);

      const queryString = qs.toString();
      const url = `/api/v1/audit-logs/export${queryString ? `?${queryString}` : ""}`;

      const response = await fetch(url, { credentials: "include" });

      if (!response.ok) {
        let message = `Export failed (HTTP ${response.status})`;
        try {
          const body = (await response.json()) as { error?: { message?: string } };
          if (body?.error?.message) message = body.error.message;
        } catch {
          // Response body is not JSON — use the generic message.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const today = new Date().toISOString().slice(0, 10);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `audit_log_${today}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  const inputCls = "w-full rounded-lg border border-[#e5d4cc] bg-white px-3 py-2 text-sm text-[#1a0808] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]";

  return (
    <div>
      {/* Page heading */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl leading-tight text-[#1a0808] font-display">Audit Log</h1>
          <p className="mt-1 text-sm font-medium text-[#7a5252]">Full trail of all system actions — who did what, when, and from where</p>
        </div>
        <button
          type="button"
          onClick={() => { void handleExportCsv(); }}
          disabled={exporting}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-[#e5d4cc] bg-white px-4 py-2 text-sm font-semibold text-[#1a0808] shadow-sm transition-colors hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e] disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Export audit log as CSV"
        >
          <Download size={15} aria-hidden="true" />
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>

      {/* Export error toast */}
      {exportError && (
        <div role="alert" className="mb-4 rounded-xl border border-[#fcc] bg-[#fef2f2] p-4 text-sm font-medium text-[#b91c1c]">
          {exportError}
        </div>
      )}

      {/* Filters */}
      <div
        className="mb-4 overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#fdf0eb] to-white border-b border-[#edd9d0]">
          <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]" aria-hidden="true" />
          <h2 className="text-sm font-bold text-[#1a0808]">Filters</h2>
        </div>
        <div className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-[160px]">
            <label htmlFor="audit-action" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">Action</label>
            <select id="audit-action" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className={inputCls}>
              <option value="">All actions</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="audit-from" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">From</label>
            <input id="audit-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="audit-to" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">To</label>
            <input id="audit-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
          </div>
          <button type="button" onClick={handleApply}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
            style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}>
            Apply
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-[#fcc] bg-[#fef2f2] p-4 text-sm font-medium text-[#b91c1c]">
          {error}
        </div>
      )}

      {/* Table */}
      <div
        className="overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" aria-label="Audit log table">
            <thead>
              <tr className="border-b-2 border-[#e5d4cc]" style={{ background: "linear-gradient(135deg, #fdf0eb 0%, #ffffff 100%)" }}>
                {["Timestamp", "User", "Action", "Entity Type", "Entity ID", "IP"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#9b6e6e] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-[#f0e4dd]">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-[#e8d5cc]" /></td>
                  ))}
                </tr>
              ))}

              {!loading && (data?.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-3 text-[#c08080]">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-[#9b6e6e]">No audit log entries found.</p>
                      <p className="mt-1 text-xs text-[#c08080]">Actions performed in the system will appear here.</p>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && (data?.items ?? []).map((entry) => (
                <tr key={entry.id} className="border-b border-[#f0e4dd] hover:bg-[#fdf5f0] transition-colors duration-150">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-[#9b6e6e]">{formatDateTime(entry.created_at)}</td>
                  <td className="px-4 py-3 text-sm text-[#7a5252]">{entry.user_email ?? entry.user_id?.slice(0, 8) ?? "System"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${ACTION_BADGE[entry.action] ?? "bg-stone-100 text-stone-600 border border-stone-200"}`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#7a5252]">{entry.entity_type}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#9b6e6e]">
                    {entry.entity_id ? entry.entity_id.slice(0, 8) + "..." : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#9b6e6e]">{entry.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-[#e5d4cc] px-5 py-3">
            <p className="text-xs font-medium text-[#9b6e6e]">{data.total} total entries</p>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-[#e5d4cc] bg-white px-3 py-1.5 text-sm font-medium text-[#1a0808] disabled:text-[#d4b0b0] disabled:cursor-not-allowed hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
                aria-label="Previous page">
                Previous
              </button>
              <span className="flex items-center px-2 text-xs text-[#9b6e6e]">Page {page} of {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-[#e5d4cc] bg-white px-3 py-1.5 text-sm font-medium text-[#1a0808] disabled:text-[#d4b0b0] disabled:cursor-not-allowed hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
                aria-label="Next page">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
