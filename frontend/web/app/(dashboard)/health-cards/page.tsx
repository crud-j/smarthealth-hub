"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { usePatientList } from "@/hooks/usePatients";
import type {
  CardGenerationAccepted,
  GenerationStatus,
  HealthCardData,
  HealthCardMaybeResponse,
} from "@/types/healthCard";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15;
/** How often (ms) to poll the single-card generation-status endpoint. */
const POLL_INTERVAL_MS = 3000;
/** How often (ms) to poll the batch-status endpoint. */
const BATCH_POLL_INTERVAL_MS = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CardStatus = "active" | "lost" | "reissued" | "revoked";

const STATUS_LABELS: Record<CardStatus, string> = {
  active: "Active",
  lost: "Lost",
  reissued: "Reissued",
  revoked: "Revoked",
};

const STATUS_BADGE: Record<CardStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  lost: "bg-red-50 text-red-700 ring-red-600/20",
  reissued: "bg-blue-50 text-blue-700 ring-blue-600/20",
  revoked: "bg-slate-50 text-slate-600 ring-slate-500/20",
};

type RowCardState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "found"; card: HealthCardData }
  | { status: "error" };

/** Shape returned by each item in the POST /health-cards/status-bulk response. */
interface CardStatusItem {
  patient_id: string;
  status: string;
  card_number: string | null;
  card_id: string | null;
  card_version: number | null;
}

/** Response from POST /health-cards/batch-generate */
interface BatchGenerateResponse {
  batch_id: string;
  total: number;
}

/** Per-patient result inside batch status */
interface BatchStatusResult {
  patient_id: string;
  status: "success" | "failed";
  error: string | null;
}

/** Response from GET /health-cards/batch-status/{batch_id} */
interface BatchStatusResponse {
  batch_id: string;
  total: number;
  completed: number;
  failed: number;
  results: BatchStatusResult[];
}

/** Active batch tracking state */
interface BatchState {
  batch_id: string;
  total: number;
  completed: number;
  failed: number;
  done: boolean;
}

// ---------------------------------------------------------------------------
// Utility hooks
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
// Icons
// ---------------------------------------------------------------------------

function SearchIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PrintIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect width="12" height="8" x="6" y="14" />
    </svg>
  );
}

function SpinnerIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function LayersIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// HealthCardBadge
// ---------------------------------------------------------------------------

function HealthCardBadge({ rowState }: { rowState: RowCardState }) {
  const baseClasses =
    "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset";

  if (rowState.status === "loading") {
    return (
      <div
        className="h-6 w-20 animate-pulse rounded-md bg-slate-100"
        aria-busy="true"
      />
    );
  }

  if (rowState.status === "none") {
    return (
      <span
        className={`${baseClasses} bg-amber-50 text-amber-700 ring-amber-600/20`}
      >
        No Card
      </span>
    );
  }

  if (rowState.status === "error") {
    return (
      <span
        className={`${baseClasses} bg-slate-50 text-slate-500 ring-slate-500/20`}
      >
        Error
      </span>
    );
  }

  return (
    <span
      className={`${baseClasses} ${STATUS_BADGE[rowState.card.status as CardStatus]}`}
    >
      {STATUS_LABELS[rowState.card.status as CardStatus]} &middot; v
      {rowState.card.card_version}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ActionCell
// ---------------------------------------------------------------------------

interface ActionCellProps {
  patientId: string;
  rowState: RowCardState;
  genStatus: GenerationStatus | null;
  onGenerate: (patientId: string) => void;
}

function ActionCell({
  patientId,
  rowState,
  genStatus,
  onGenerate,
}: ActionCellProps) {
  if (genStatus !== null) {
    if (genStatus.status === "pending") {
      return (
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
          <SpinnerIcon className="h-4 w-4 text-rose-500" />
          Generating...
        </span>
      );
    }

    if (genStatus.status === "ready" && genStatus.pdf_url) {
      return (
        <a
          href={`${process.env.NEXT_PUBLIC_API_BASE_URL?.replace("/api/v1", "") ?? "http://localhost:8000"}/media/${genStatus.pdf_url}`}
          download
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition-all active:scale-[0.96]"
        >
          <PrintIcon />
          Download PDF
        </a>
      );
    }

    if (genStatus.status === "failed") {
      return (
        <button
          type="button"
          onClick={() => onGenerate(patientId)}
          className="inline-flex items-center justify-center min-w-[160px] rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 transition-all active:scale-[0.96]"
        >
          Generation failed — retry
        </button>
      );
    }
  }

  if (rowState.status === "found") {
    return (
      <Link
        href={`/health-cards/${patientId}/print`}
        className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 transition-all active:scale-[0.96]"
      >
        <PrintIcon />
        View / Print
      </Link>
    );
  }

  if (rowState.status === "none") {
    return (
      <button
        type="button"
        onClick={() => onGenerate(patientId)}
        className="inline-flex items-center justify-center min-w-[120px] rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 transition-all active:scale-[0.96]"
      >
        Generate Card
      </button>
    );
  }

  if (rowState.status === "error") {
    return (
      <span className="text-sm text-slate-400" aria-hidden="true">
        —
      </span>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// BatchProgressBar
// ---------------------------------------------------------------------------

interface BatchProgressBarProps {
  batch: BatchState;
  onDismiss: () => void;
}

function BatchProgressBar({ batch, onDismiss }: BatchProgressBarProps) {
  const done = batch.completed + batch.failed;
  const pct = batch.total > 0 ? Math.round((done / batch.total) * 100) : 0;

  return (
    <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-6 py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {!batch.done && (
            <SpinnerIcon className="h-4 w-4 text-blue-600" />
          )}
          <span className="text-sm font-semibold text-blue-900">
            {batch.done
              ? `Batch complete — ${batch.completed}/${batch.total} generated successfully`
              : `Generating cards… ${done}/${batch.total}`}
          </span>
        </div>
        {batch.done && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Dismiss
          </button>
        )}
      </div>
      <div className="h-2 w-full rounded-full bg-blue-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            batch.failed > 0 && batch.done
              ? "bg-amber-500"
              : "bg-blue-600"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {batch.done && batch.failed > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          {batch.failed} card{batch.failed === 1 ? "" : "s"} failed to generate. Use individual Generate Card buttons to retry.
        </p>
      )}
    </div>
  );
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

  const [cardMap, setCardMap] = useState<Record<string, RowCardState>>({});

  // Map: patientId → GenerationStatus — tracks in-flight single-card tasks.
  const [genStatusMap, setGenStatusMap] = useState<
    Record<string, GenerationStatus>
  >({});

  // Ref to hold the current genStatusMap for use inside the polling interval.
  const genStatusRef = useRef(genStatusMap);
  useEffect(() => {
    genStatusRef.current = genStatusMap;
  }, [genStatusMap]);

  // ---------------------------------------------------------------------------
  // Batch selection state
  // ---------------------------------------------------------------------------
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchState, setBatchState] = useState<BatchState | null>(null);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);

  // Ref for polling interval so we can clear it when the batch finishes.
  const batchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const pageIds: string[] = data?.items.map((p) => p.id) ?? [];
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someOnPageSelected = pageIds.some((id) => selectedIds.has(id));

  // Clear selection when the page changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, q]);

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load patients: ${error.message}`);
    }
  }, [error]);

  // ---------------------------------------------------------------------------
  // Bulk card status fetch — one POST per page load instead of N individual GETs.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!data) return;
    let cancelled = false;

    setCardMap(
      Object.fromEntries(
        data.items.map((p) => [p.id, { status: "loading" as const }])
      )
    );

    async function loadStatuses() {
      const patientIds: string[] = data!.items.map((p) => p.id);

      if (patientIds.length === 0) {
        if (!cancelled) setCardMap({});
        return;
      }

      try {
        const bulkResp = await apiFetch<{ items: CardStatusItem[] }>(
          "/health-cards/status-bulk",
          {
            method: "POST",
            body: JSON.stringify({ patient_ids: patientIds }),
          }
        );

        const cardStatusMap = new Map<string, CardStatusItem>(
          bulkResp.items.map((item) => [item.patient_id, item])
        );

        const results: [string, RowCardState][] = patientIds.map((pid) => {
          const item: CardStatusItem | undefined = cardStatusMap.get(pid);
          if (!item || item.status === "none") {
            return [pid, { status: "none" }];
          }
          return [
            pid,
            {
              status: "found",
              card: {
                id: item.card_id ?? "",
                patient_id: item.patient_id,
                card_number: item.card_number ?? "",
                card_version: item.card_version ?? 1,
                status: item.status as HealthCardData["status"],
                issued_at: "",
                expires_at: null,
                nfc_uid: null,
                qr_data_uri: null,
              } satisfies HealthCardData,
            },
          ];
        });

        if (!cancelled) {
          setCardMap(Object.fromEntries(results));
        }
      } catch {
        if (!cancelled) {
          setCardMap(
            Object.fromEntries(
              patientIds.map((pid) => [pid, { status: "error" as const }])
            )
          );
        }
      }
    }

    void loadStatuses();
    return () => {
      cancelled = true;
    };
  }, [data]);

  // ---------------------------------------------------------------------------
  // Single-card polling loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const interval = setInterval(async () => {
      const current = genStatusRef.current;
      const pendingEntries = Object.entries(current).filter(
        ([, gs]) => gs.status === "pending"
      );
      if (pendingEntries.length === 0) return;

      await Promise.all(
        pendingEntries.map(async ([patientId, gs]) => {
          try {
            const updated = await apiFetch<GenerationStatus>(
              `/health-cards/generation-status/${gs.card_id}`
            );
            setGenStatusMap((prev) => ({
              ...prev,
              [patientId]: { ...updated, task_id: gs.task_id },
            }));

            if (updated.status === "ready") {
              try {
                const resp = await apiFetch<HealthCardMaybeResponse>(
                  `/health-cards/${patientId}?allow_missing=true`
                );
                if (resp.card_found && resp.card !== null) {
                  setCardMap((m) => ({
                    ...m,
                    [patientId]: {
                      status: "found",
                      card: resp.card as HealthCardData,
                    },
                  }));
                }
              } catch {
                // Non-critical — badge stays as-is.
              }
              toast.success("Health card PDF is ready.");
            }
          } catch {
            // Non-fatal polling error — retry next tick.
          }
        })
      );
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []); // stable interval — reads genStatusRef.current each tick

  // ---------------------------------------------------------------------------
  // Batch polling loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      // Clean up polling interval on unmount.
      if (batchPollRef.current !== null) {
        clearInterval(batchPollRef.current);
        batchPollRef.current = null;
      }
    };
  }, []);

  const startBatchPolling = useCallback((batchId: string, total: number) => {
    // Clear any previous interval.
    if (batchPollRef.current !== null) {
      clearInterval(batchPollRef.current);
    }

    batchPollRef.current = setInterval(async () => {
      try {
        const status = await apiFetch<BatchStatusResponse>(
          `/health-cards/batch-status/${batchId}`
        );

        const done = status.completed + status.failed === status.total;

        setBatchState({
          batch_id: batchId,
          total: status.total,
          completed: status.completed,
          failed: status.failed,
          done,
        });

        if (done) {
          if (batchPollRef.current !== null) {
            clearInterval(batchPollRef.current);
            batchPollRef.current = null;
          }
          toast.success(
            `Generated ${status.completed}/${total} cards successfully.${
              status.failed > 0
                ? ` ${status.failed} failed — retry individually.`
                : ""
            }`
          );
        }
      } catch {
        // Non-fatal — retry next tick.
      }
    }, BATCH_POLL_INTERVAL_MS);
  }, []);

  // ---------------------------------------------------------------------------
  // handleGenerate — single card
  // ---------------------------------------------------------------------------
  const handleGenerate = useCallback(async (patientId: string) => {
    setGenStatusMap((prev) => ({
      ...prev,
      [patientId]: { card_id: "", status: "pending" },
    }));

    try {
      const resp = await apiFetch<CardGenerationAccepted>(
        `/health-cards/${patientId}/generate`,
        { method: "POST" }
      );
      setGenStatusMap((prev) => ({
        ...prev,
        [patientId]: {
          card_id: resp.card_id,
          task_id: resp.task_id,
          status: "pending",
        },
      }));
    } catch (err) {
      setGenStatusMap((prev) => {
        const next = { ...prev };
        delete next[patientId];
        return next;
      });
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Failed to generate health card."
      );
    }
  }, []);

  // ---------------------------------------------------------------------------
  // handleBatchGenerate — POST batch-generate with selected IDs
  // ---------------------------------------------------------------------------
  const handleBatchGenerate = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setIsBatchSubmitting(true);
    setBatchState({
      batch_id: "",
      total: ids.length,
      completed: 0,
      failed: 0,
      done: false,
    });

    try {
      const resp = await apiFetch<BatchGenerateResponse>(
        "/health-cards/batch-generate",
        {
          method: "POST",
          body: JSON.stringify({ patient_ids: ids }),
        }
      );

      setSelectedIds(new Set());
      setBatchState({
        batch_id: resp.batch_id,
        total: resp.total,
        completed: 0,
        failed: 0,
        done: false,
      });

      startBatchPolling(resp.batch_id, resp.total);
    } catch (err) {
      setBatchState(null);
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Failed to start batch generation."
      );
    } finally {
      setIsBatchSubmitting(false);
    }
  }, [selectedIds, startBatchPolling]);

  // ---------------------------------------------------------------------------
  // Checkbox helpers
  // ---------------------------------------------------------------------------
  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allOnPageSelected, pageIds]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Health Cards
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Generate and manage patient health cards (NFC + QR code).
        </p>
      </header>

      {/* Batch progress bar */}
      {batchState !== null && (
        <BatchProgressBar
          batch={batchState}
          onDismiss={() => setBatchState(null)}
        />
      )}

      {/* Toolbar: search + batch button */}
      <section
        className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-label="Search and batch actions"
      >
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-900">
            Patient Lookup
          </h2>

          {/* Batch Generate button — only visible when rows are checked */}
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => void handleBatchGenerate()}
              disabled={isBatchSubmitting}
              className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 transition-all active:scale-[0.96]"
              aria-label={`Batch generate cards for ${selectedIds.size} selected patient${selectedIds.size === 1 ? "" : "s"}`}
            >
              {isBatchSubmitting ? (
                <SpinnerIcon className="h-4 w-4" />
              ) : (
                <LayersIcon className="h-4 w-4" />
              )}
              Batch Generate Cards
              <span className="inline-flex items-center justify-center rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-bold leading-none">
                {selectedIds.size}
              </span>
            </button>
          )}
        </div>
        <div className="p-6">
          <div className="max-w-md">
            <label
              htmlFor="hc-search"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Search parameters
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <SearchIcon className="h-5 w-5 text-slate-400" />
              </div>
              <input
                id="hc-search"
                type="search"
                placeholder="Name, code, or mobile number..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="block w-full rounded-md border-0 py-2 pl-10 pr-4 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-rose-500 sm:text-sm sm:leading-6 transition-all"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Data Table */}
      <section
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-label="Patient Health Cards List"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {/* Select-all checkbox */}
                <th scope="col" className="w-10 px-4 py-3.5">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allOnPageSelected}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate =
                          someOnPageSelected && !allOnPageSelected;
                      }
                    }}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Patient Code
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Full Name
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Card Status
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {/* Loading State */}
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td
                        key={`skeleton-cell-${j}`}
                        className="px-6 py-4 whitespace-nowrap"
                      >
                        <div
                          className="h-4 w-full max-w-[120px] animate-pulse rounded bg-slate-100"
                          aria-busy="true"
                        />
                      </td>
                    ))}
                  </tr>
                ))}

              {/* Empty State */}
              {!loading && (data?.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                      <div className="rounded-full bg-slate-50 p-3 mb-4 ring-1 ring-slate-200">
                        <SearchIcon className="h-6 w-6 text-slate-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {q
                          ? `No patients match "${q}"`
                          : "No patients registered"}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Register patients first to generate health cards.
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data Rows */}
              {!loading &&
                (data?.items ?? []).map((p) => {
                  const rowState: RowCardState =
                    cardMap[p.id] ?? { status: "loading" };
                  const genStatus: GenerationStatus | null =
                    genStatusMap[p.id] ?? null;
                  const isSelected = selectedIds.has(p.id);

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50 transition-colors group ${
                        isSelected ? "bg-rose-50" : ""
                      }`}
                    >
                      {/* Row checkbox */}
                      <td className="w-10 px-4 py-4">
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.fullName}`}
                          checked={isSelected}
                          onChange={() => toggleRow(p.id)}
                          className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                          suppressHydrationWarning
                        />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-slate-500">
                        {p.patientCode}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                        {p.fullName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <HealthCardBadge rowState={rowState} />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <ActionCell
                          patientId={p.id}
                          rowState={rowState}
                          genStatus={genStatus}
                          onGenerate={(id) => void handleGenerate(id)}
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4">
            <div className="hidden sm:block">
              <p className="text-sm text-slate-700">
                Showing{" "}
                <span className="font-medium">
                  {(page - 1) * PAGE_SIZE + 1}
                </span>{" "}
                to{" "}
                <span className="font-medium">
                  {Math.min(page * PAGE_SIZE, data.total)}
                </span>{" "}
                of <span className="font-medium">{data.total}</span> results
              </p>
            </div>
            <div className="flex flex-1 justify-between sm:justify-end gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="relative inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.96]"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="relative inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.96]"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
