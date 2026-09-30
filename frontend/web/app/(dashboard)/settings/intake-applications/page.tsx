"use client";
/**
 * Admin — Online Intake Applications Review page
 * URL: /settings/intake-applications
 * Auth: Admin only
 *
 * Lists all pending/approved/rejected intake applications.
 * Admin can view detail, approve (creates patient record), or reject.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/hooks/useAuth";
import {
  IntakeApplicationReviewModal,
  type IntakeApplicationSummary,
} from "@/components/intake/IntakeApplicationReviewModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaginatedApplications {
  items: IntakeApplicationSummary[];
  total: number;
  page: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastState { message: string; kind: "success" | "error"; }

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(t);
  }, [onDismiss]);
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-xl ${
        toast.kind === "success" ? "bg-[#16a34a]" : "bg-[#dc2626]"
      }`}
    >
      {toast.message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge (used only in the table — not duplicating the modal's badge)
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending:  { bg: "bg-amber-100",  text: "text-amber-800",  label: "Pending" },
    approved: { bg: "bg-green-100",  text: "text-green-800",  label: "Approved" },
    rejected: { bg: "bg-red-100",    text: "text-red-800",    label: "Rejected" },
  };
  const c = config[status] ?? { bg: "bg-slate-100", text: "text-slate-700", label: status };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

export default function IntakeApplicationsPage() {
  const { user } = useCurrentUser();
  const [apps, setApps] = useState<IntakeApplicationSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const isAdmin = user?.role === "admin";

  // mounted guard: user?.role is unavailable during SSR. The early-return access
  // denied block would always render server-side (user is null), then flip to the
  // full page on the client, causing a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (statusFilter) params.set("status", statusFilter);
      if (q.trim()) params.set("q", q.trim());
      const data = await apiFetch<PaginatedApplications>(`/intake-applications?${params.toString()}`);
      setApps(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load applications.");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, q]);

  useEffect(() => { void fetchApplications(); }, [fetchApplications]);

  if (mounted && !isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Access denied. Only Admins can view intake applications.
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Online Registration Applications
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review and approve public self-registration submissions.
          </p>
        </div>
      </header>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg border border-[#e5d4cc] overflow-hidden">
          {["pending", "approved", "rejected", ""].map((s) => (
            <button
              key={s || "all"}
              type="button"
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                statusFilter === s
                  ? "bg-[#b5343e] text-white"
                  : "bg-white text-[#3d2222] hover:bg-[#fdf5f0]"
              }`}
            >
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search by name or reference..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          className="rounded-lg border border-[#e5d4cc] px-3 py-2 text-sm text-[#1a0808] placeholder-[#b09090] focus:outline-none focus:ring-2 focus:ring-[#b5343e] w-64"
        />
        <span className="text-sm text-slate-500">{total} application{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[#e5d4cc] bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading applications...</div>
        ) : apps.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No {statusFilter || ""} applications found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[#edd9d0] bg-gradient-to-br from-[#fdf0eb] to-white">
              <tr>
                {["Reference", "Applicant", "Birth Date", "Barangay", "Submitted", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#b09090]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr
                  key={app.id}
                  className="border-b border-[#f0e4dd] hover:bg-[#fdf5f0] cursor-pointer transition-colors"
                  onClick={() => setSelectedId(app.id)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-[#9b6e6e]">{app.reference_number}</td>
                  <td className="px-4 py-3 font-medium text-[#1a0808]">
                    {app.last_name}, {app.first_name}
                    {app.mobile_number && (
                      <span className="block text-xs text-[#7a5252]">{app.mobile_number}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#7a5252]">{app.birth_date}</td>
                  <td className="px-4 py-3 text-[#7a5252]">{app.barangay}, {app.municipality}</td>
                  <td className="px-4 py-3 text-[#7a5252] whitespace-nowrap">
                    {new Date(app.created_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={app.status} /></td>
                  <td className="px-4 py-3">
                    {app.patient_id && (
                      <Link
                        href={`/patients/${app.patient_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-semibold text-[#b5343e] hover:underline"
                      >
                        View Patient
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-between items-center text-sm text-slate-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-[#e5d4cc] px-3 py-1.5 disabled:opacity-40 hover:bg-[#fdf5f0]"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-[#e5d4cc] px-3 py-1.5 disabled:opacity-40 hover:bg-[#fdf5f0]"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selectedId && (
        <IntakeApplicationReviewModal
          applicationId={selectedId}
          onClose={() => setSelectedId(null)}
          onApproved={(patientId, patientCode) => {
            setSelectedId(null);
            setToast({ message: `Patient ${patientCode} created successfully.`, kind: "success" });
            void fetchApplications();
          }}
          onRejected={() => {
            setSelectedId(null);
            setToast({ message: "Application rejected.", kind: "success" });
            void fetchApplications();
          }}
        />
      )}

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </main>
  );
}
