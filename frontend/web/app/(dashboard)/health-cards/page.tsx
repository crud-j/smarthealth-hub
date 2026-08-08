"use client";

/**
 * Health Cards management page.
 *
 * Per SDP Section 7.1 this route's purpose is "Card management, batch print
 * queue." It provides:
 *  - A searchable, paginated patient list (usePatientList, same hook/params
 *    used by the main /patients list and the SMS manual-send picker).
 *  - Per-row card status, fetched via GET /health-cards/{patient_id} across
 *    the visible page with Promise.all (bounded to ~15 rows/page — no
 *    pagination-scale N+1 concern).
 *  - "Generate Card" action for patients without a card (idempotent POST
 *    /health-cards/{patient_id}/generate), updating that row in place.
 *  - "View / Print" link to the existing, working
 *    /health-cards/[patientId]/print page for patients who already have one.
 *
 * Cards never carry PHI — this page only ever displays patient_code,
 * full_name, and card status/version, mirroring the hybrid NFC+QR design
 * (patient_id + card_version + HMAC only).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { swError, swSuccess } from "@/lib/swal";
import { usePatientList } from "@/hooks/usePatients";
import type { HealthCardData, HealthCardMaybeResponse, CardGenerateResponse, CardStatus } from "@/types/healthCard";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15;

const STATUS_LABELS: Record<CardStatus, string> = {
  active: "Active",
  lost: "Lost",
  reissued: "Reissued",
  revoked: "Revoked",
};

const STATUS_COLORS: Record<CardStatus, string> = {
  active: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
  reissued: "bg-blue-100 text-blue-700",
  revoked: "bg-slate-200 text-slate-600",
};

// ---------------------------------------------------------------------------
// Row card-status state
// ---------------------------------------------------------------------------

type RowCardState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "found"; card: HealthCardData }
  | { status: "error" };

// ---------------------------------------------------------------------------
// Debounce helper (matches the pattern used by patients/_components/PatientListClient.tsx)
// ---------------------------------------------------------------------------

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HealthCardsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(searchInput, 300);

  useEffect(() => {
    setPage(1);
  }, [q]);

  const { data, loading, error } = usePatientList({
    q: q || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  // Per-row card status, keyed by patient id.
  const [cardMap, setCardMap] = useState<Record<string, RowCardState>>({});
  // Per-row "Generate Card" in-flight flag.
  const [generating, setGenerating] = useState<Record<string, boolean>>({});

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  // Surface patient-list fetch errors via toast
  useEffect(() => {
    if (error) {
      void swError(`Failed to load patients: ${error.message}`);
    }
  }, [error]);

  // Fetch card metadata for every patient on the current page whenever the
  // visible list changes (new page, new search, refetch).
  useEffect(() => {
    if (!data) return;
    let cancelled = false;

    // Mark all visible rows as loading immediately so stale statuses from a
    // previous page don't linger while the new batch resolves.
    setCardMap(
      Object.fromEntries(data.items.map((p) => [p.id, { status: "loading" as const }]))
    );

    async function loadStatuses() {
      const results = await Promise.all(
        data!.items.map(async (p) => {
          try {
            // Use allow_missing=true so the backend returns HTTP 200 with
            // { card_found: false, card: null } for patients who have no
            // card yet, instead of HTTP 404.  This eliminates the browser
            // console network error spam during the list-view poll.
            const resp = await apiFetch<HealthCardMaybeResponse>(
              `/health-cards/${p.id}?allow_missing=true`
            );
            if (!resp.card_found || resp.card === null) {
              return [p.id, { status: "none" } as RowCardState] as const;
            }
            return [p.id, { status: "found", card: resp.card as HealthCardData } as RowCardState] as const;
          } catch {
            return [p.id, { status: "error" } as RowCardState] as const;
          }
        })
      );
      if (!cancelled) {
        setCardMap(Object.fromEntries(results));
      }
    }

    void loadStatuses();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const handleGenerate = useCallback(async (patientId: string) => {
    setGenerating((g) => ({ ...g, [patientId]: true }));
    try {
      const resp = await apiFetch<CardGenerateResponse>(
        `/health-cards/${patientId}/generate`,
        { method: "POST" }
      );
      setCardMap((m) => ({ ...m, [patientId]: { status: "found", card: resp.card } }));
      void swSuccess("Health card generated successfully.");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to generate health card.";
      void swError(message);
    } finally {
      setGenerating((g) => ({ ...g, [patientId]: false }));
    }
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-dm-serif, Georgia, serif)", fontWeight: 400, color: "#1a0808" }}>Health Cards</h1>
          <p className="mt-0.5 text-sm" style={{ color: "#7a5252" }}>
            Generate and manage patient health cards (NFC + QR code)
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-4 rounded-xl bg-white p-4 shadow-sm" style={{ border: "1px solid #e5d4cc" }}>
        <div className="max-w-sm">
          <label htmlFor="hc-search" className="mb-1 block text-xs font-medium text-slate-600">
            Search patients
          </label>
          <input
            id="hc-search"
            type="search"
            placeholder="Search by name, code, or mobile…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-white shadow-sm" style={{ border: "1px solid #e5d4cc", boxShadow: "0 2px 10px rgba(160,80,80,0.06)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Health cards table">
            <thead>
              <tr className="text-left" style={{ background: "linear-gradient(135deg, #fdf0eb 0%, #ffffff 100%)", borderBottom: "2px solid #e5d4cc" }}>
                <th className="px-4 py-3 font-semibold" style={{ color: "#9b6e6e" }}>Patient Code</th>
                <th className="px-4 py-3 font-semibold" style={{ color: "#9b6e6e" }}>Full Name</th>
                <th className="px-4 py-3 font-semibold" style={{ color: "#9b6e6e" }}>Card Status</th>
                <th className="px-4 py-3 font-semibold" style={{ color: "#9b6e6e" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 4 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-slate-200" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading && (data?.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center" style={{ color: "#b09090" }}>
                    {q ? `No patients match "${q}"` : "No patients registered yet."}
                  </td>
                </tr>
              )}

              {!loading &&
                (data?.items ?? []).map((p) => {
                  const rowState: RowCardState = cardMap[p.id] ?? { status: "loading" };
                  const isGenerating = generating[p.id] ?? false;

                  return (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {p.patientCode}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{p.fullName}</td>
                      <td className="px-4 py-3">
                        {rowState.status === "loading" && (
                          <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
                        )}
                        {rowState.status === "none" && (
                          <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                            No Card
                          </span>
                        )}
                        {rowState.status === "error" && (
                          <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                            Unknown
                          </span>
                        )}
                        {rowState.status === "found" && (
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[rowState.card.status]}`}
                          >
                            {STATUS_LABELS[rowState.card.status]} · v{rowState.card.card_version}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {rowState.status === "found" && (
                          <Link
                            href={`/health-cards/${p.id}/print`}
                            className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            View / Print
                          </Link>
                        )}
                        {rowState.status === "none" && (
                          <button
                            type="button"
                            onClick={() => void handleGenerate(p.id)}
                            disabled={isGenerating}
                            className="inline-flex min-h-[36px] items-center rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                            style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}
                          >
                            {isGenerating ? "Generating…" : "Generate Card"}
                          </button>
                        )}
                        {rowState.status === "error" && (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid #e5d4cc" }}>
            <p className="text-xs" style={{ color: "#9b6e6e" }}>{data.total} total patients</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="min-h-[36px] rounded-lg px-3 text-sm disabled:opacity-40" style={{ border: "1px solid #e5d4cc" }}
                aria-label="Previous page"
              >
                Previous
              </button>
              <span className="flex items-center text-xs text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="min-h-[36px] rounded-lg px-3 text-sm disabled:opacity-40" style={{ border: "1px solid #e5d4cc" }}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
