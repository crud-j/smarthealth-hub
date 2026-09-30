"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePatientList, useBatchPdf } from "@/hooks/usePatients";
import { useCurrentUser } from "@/hooks/useAuth";
import type { PatientSummary } from "@/types/patient";

const PAGE_SIZE = 20;
const BATCH_PRINT_MAX = 50;

// ---------------------------------------------------------------------------
// Flag badge
// ---------------------------------------------------------------------------

function FlagBadge({ active, label, colorClass }: { active: boolean; label: string; colorClass: string }) {
  if (!active) return null;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider ${colorClass}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Patient table row
// ---------------------------------------------------------------------------

function PatientRow({
  patient,
  selected,
  onToggle,
  showCheckbox,
}: {
  patient: PatientSummary;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
  showCheckbox: boolean;
}) {
  return (
    <tr className={`border-b border-[#f0e4dd] transition-colors duration-150 hover:bg-[#fdf5f0] ${selected ? "bg-[#fff0ee]" : "bg-white"}`}>
      {showCheckbox && (
        <td className="w-10 px-3 py-3 text-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggle(patient.id, e.target.checked)}
            aria-label={`Select ${patient.fullName}`}
            className="h-4 w-4 cursor-pointer accent-[#b5343e]"
          />
        </td>
      )}

      <td className="px-4 py-3 font-mono text-sm font-medium text-[#1a0808] whitespace-nowrap">
        {patient.patientCode}
      </td>

      <td className="px-4 py-3">
        <p className="text-sm font-semibold text-[#1a0808]">{patient.fullName}</p>
      </td>

      <td className="px-4 py-3 text-sm text-[#7a5252] whitespace-nowrap">
        {patient.age} / {patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1)}
      </td>

      <td className="px-4 py-3 text-sm text-[#7a5252]">
        {patient.mobileNumber ?? <span className="italic text-[#d4b0b0]">—</span>}
      </td>

      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex flex-wrap gap-1">
          <FlagBadge active={patient.isSenior} label="Senior" colorClass="bg-violet-100 text-violet-700" />
          <FlagBadge active={patient.isPwd} label="PWD" colorClass="bg-sky-100 text-sky-700" />
          <FlagBadge active={patient.isPregnant} label="Pregnant" colorClass="bg-pink-100 text-pink-700" />
          {!patient.isSenior && !patient.isPwd && !patient.isPregnant && (
            <span className="text-xs text-[#d4b0b0]">—</span>
          )}
        </div>
      </td>

      <td className="px-4 py-3 text-right">
        <Link
          href={`/patients/${patient.id}`}
          className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}
        >
          View
        </Link>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Debounce hook
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
// Main component
// ---------------------------------------------------------------------------

export default function PatientListClient() {
  const [searchInput, setSearchInput] = useState("");
  const [filterSenior, setFilterSenior] = useState<boolean | undefined>(undefined);
  const [filterPwd, setFilterPwd] = useState<boolean | undefined>(undefined);
  const [filterPregnant, setFilterPregnant] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);

  const { printBatch, loading: batchLoading } = useBatchPdf();

  const { user } = useCurrentUser();
  const canBatchPrint = user?.role === "admin" || user?.role === "bhw";

  const q = useDebounced(searchInput, 300);

  useEffect(() => { setPage(1); }, [q, filterSenior, filterPwd, filterPregnant]);
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectionWarning(null);
  }, [q, filterSenior, filterPwd, filterPregnant, page]);

  const { data, loading, error } = usePatientList({
    q: q || undefined,
    page,
    pageSize: PAGE_SIZE,
    isSenior: filterSenior,
    isPwd: filterPwd,
    isPregnant: filterPregnant,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const pageIds: string[] = data?.items.map((p) => p.id) ?? [];
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = !allPageSelected && pageIds.some((id) => selectedIds.has(id));

  const handleRowToggle = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (next.size >= BATCH_PRINT_MAX) {
          setSelectionWarning(`Maximum ${BATCH_PRINT_MAX} patients can be selected for batch print.`);
          return prev;
        }
        next.add(id);
      } else {
        next.delete(id);
      }
      if (next.size < BATCH_PRINT_MAX) setSelectionWarning(null);
      return next;
    });
  }, []);

  const handleMasterToggle = useCallback((checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of pageIds) {
          if (next.size >= BATCH_PRINT_MAX) {
            setSelectionWarning(`Maximum ${BATCH_PRINT_MAX} patients can be selected for batch print.`);
            break;
          }
          next.add(id);
        }
      } else {
        for (const id of pageIds) { next.delete(id); }
        setSelectionWarning(null);
      }
      return next;
    });
  }, [pageIds]);

  function toggleFilter(current: boolean | undefined, setter: (v: boolean | undefined) => void) {
    if (current === undefined) setter(true);
    else if (current === true) setter(false);
    else setter(undefined);
  }

  function filterButtonClass(active: boolean | undefined, trueClass: string, falseClass: string): string {
    if (active === true) return trueClass;
    if (active === false) return falseClass;
    return "rounded-lg border border-[#e5d4cc] bg-white px-3 py-1.5 text-xs font-medium text-[#9b6e6e] cursor-pointer hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]";
  }

  return (
    <div>
      {/* Controls bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search by name, code, or mobile..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search patients"
          className="min-w-[200px] flex-1 rounded-lg border border-[#e5d4cc] bg-white px-3 py-2 text-sm text-[#1a0808] placeholder-[#c08080] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
        />

        <button
          onClick={() => toggleFilter(filterSenior, setFilterSenior)}
          className={filterButtonClass(
            filterSenior,
            "rounded-lg border border-violet-400 bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-700 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600",
            "rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
          )}
          title="Toggle Senior filter"
        >
          Senior {filterSenior === true ? "✓" : filterSenior === false ? "✗" : ""}
        </button>
        <button
          onClick={() => toggleFilter(filterPwd, setFilterPwd)}
          className={filterButtonClass(
            filterPwd,
            "rounded-lg border border-sky-400 bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-700 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600",
            "rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
          )}
          title="Toggle PWD filter"
        >
          PWD {filterPwd === true ? "✓" : filterPwd === false ? "✗" : ""}
        </button>
        <button
          onClick={() => toggleFilter(filterPregnant, setFilterPregnant)}
          className={filterButtonClass(
            filterPregnant,
            "rounded-lg border border-pink-400 bg-pink-100 px-3 py-1.5 text-xs font-semibold text-pink-700 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-600",
            "rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
          )}
          title="Toggle Pregnant filter"
        >
          Pregnant {filterPregnant === true ? "✓" : filterPregnant === false ? "✗" : ""}
        </button>

        {canBatchPrint && selectedIds.size >= 1 && (
          <button
            onClick={() => void printBatch([...selectedIds])}
            disabled={batchLoading}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e] whitespace-nowrap"
            style={{ background: batchLoading ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)" }}
          >
            {batchLoading ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Generating...
              </>
            ) : `Print Selected (${selectedIds.size})`}
          </button>
        )}

        <Link
          href="/patients/new"
          className="ml-auto flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Register Patient
        </Link>
      </div>

      {/* Selection warning */}
      {selectionWarning && (
        <div role="alert" className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {selectionWarning}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-[#fcc] bg-[#fef2f2] p-4 text-sm font-medium text-[#b91c1c]">
          {error.message}
        </div>
      )}

      {/* Table */}
      <div
        className="overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" aria-label="Patient records">
            <thead>
              <tr
                className="border-b-2 border-[#e5d4cc]"
                style={{ background: "linear-gradient(135deg, #fdf0eb 0%, #ffffff 100%)" }}
              >
                {canBatchPrint && (
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={(el) => { if (el) el.indeterminate = somePageSelected; }}
                      onChange={(e) => handleMasterToggle(e.target.checked)}
                      aria-label="Select all patients on this page"
                      disabled={pageIds.length === 0}
                      className="h-4 w-4 cursor-pointer accent-[#b5343e]"
                    />
                  </th>
                )}
                {["Patient Code", "Full Name", "Age / Sex", "Contact No.", "Flags", ""].map((h) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#9b6e6e] whitespace-nowrap ${h === "" ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#f0e4dd]">
                  {Array.from({ length: canBatchPrint ? 7 : 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-[#e8d5cc]" />
                    </td>
                  ))}
                </tr>
              ))}

              {!loading && data && data.items.length === 0 && (
                <tr>
                  <td colSpan={canBatchPrint ? 7 : 6}>
                    <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-3 text-[#c08080]">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-[#9b6e6e]">
                        {q ? `No patients match "${q}"` : "No patients registered yet."}
                      </p>
                      <p className="mt-1 text-xs text-[#c08080]">
                        {q ? "Try a different search term." : "Register the first patient to get started."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && data?.items.map((p) => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  selected={canBatchPrint && selectedIds.has(p.id)}
                  onToggle={canBatchPrint ? handleRowToggle : () => undefined}
                  showCheckbox={canBatchPrint}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#e5d4cc]">
            <span className="text-sm font-medium text-[#9b6e6e]">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total} patient{data.total !== 1 ? "s" : ""}
              {selectedIds.size > 0 && (
                <span className="ml-2 font-semibold text-[#c94040]">({selectedIds.size} selected)</span>
              )}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-[#e5d4cc] bg-white px-3 py-1.5 text-sm font-medium text-[#1a0808] disabled:text-[#d4b0b0] disabled:cursor-not-allowed hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
              >
                Previous
              </button>
              <span className="flex items-center px-2 text-sm text-[#9b6e6e]">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-[#e5d4cc] bg-white px-3 py-1.5 text-sm font-medium text-[#1a0808] disabled:text-[#d4b0b0] disabled:cursor-not-allowed hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
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
