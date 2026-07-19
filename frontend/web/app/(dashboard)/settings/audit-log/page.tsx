"use client";

/**
 * Settings / Audit Log page — Admin only.
 *
 * Paginated table of audit log entries filtered by action and date range.
 * Columns: Timestamp, User, Action, Entity Type, Entity ID, IP Address.
 *
 * Backend endpoint: GET /audit-logs (Admin only, enforced server-side).
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  id: string;
  user_id: string | null;
  user_email?: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

interface PaginatedAuditLogs {
  items: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  VIEW: "bg-slate-100 text-slate-600",
  VIEW_PHI: "bg-amber-100 text-amber-700",
  LOGIN: "bg-teal-100 text-teal-700",
  LOGOUT: "bg-slate-100 text-slate-500",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "VIEW", "VIEW_PHI", "LOGIN", "LOGOUT"];
const PAGE_SIZE = 20;

export default function AuditLogPage() {
  const [data, setData] = useState<PaginatedAuditLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState({ action: "", from: "", to: "" });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (applied.action) qs.set("action", applied.action);
      if (applied.from) qs.set("date_from", applied.from);
      if (applied.to) qs.set("date_to", applied.to);
      const raw = await apiFetch<PaginatedAuditLogs>(`/audit-logs?${qs.toString()}`);
      setData(raw);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [page, applied]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  function handleApply() {
    setPage(1);
    setApplied({ action: actionFilter, from: dateFrom, to: dateTo });
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Full trail of all system actions — who did what, when, and from where
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px]">
            <label htmlFor="audit-action" className="mb-1 block text-xs font-medium text-slate-600">Action</label>
            <select id="audit-action" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">All actions</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="audit-from" className="mb-1 block text-xs font-medium text-slate-600">From</label>
            <input id="audit-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="audit-to" className="mb-1 block text-xs font-medium text-slate-600">To</label>
            <input id="audit-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <button type="button" onClick={handleApply}
            className="min-h-[44px] rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
            Apply
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Audit log table">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Timestamp</th>
                <th className="px-4 py-3 font-semibold text-slate-600">User</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Action</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Entity Type</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Entity ID</th>
                <th className="px-4 py-3 font-semibold text-slate-600">IP</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-slate-200" />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && (data?.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    No audit log entries found.
                  </td>
                </tr>
              )}
              {!loading && (data?.items ?? []).map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {formatDateTime(entry.created_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{entry.user_email ?? entry.user_id?.slice(0, 8) ?? "System"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${ACTION_COLORS[entry.action] ?? "bg-slate-100 text-slate-600"}`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{entry.entity_type}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    {entry.entity_id ? entry.entity_id.slice(0, 8) + "…" : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{entry.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{data.total} total entries</p>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50 disabled:opacity-40" aria-label="Previous page">
                Previous
              </button>
              <span className="flex items-center text-xs text-slate-500">Page {page} of {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50 disabled:opacity-40" aria-label="Next page">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
