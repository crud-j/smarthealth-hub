"use client";
/**
 * PatientListClient — interactive patient list with search, filters, and
 * pagination.
 *
 * This Client Component is responsible for:
 *   - Search input that debounces and passes ``q`` to ``usePatientList``
 *   - Flag filter toggles (Senior, PWD, Pregnant)
 *   - Rendering the patient table
 *   - Pagination controls
 *   - "Register Patient" button (links to /patients/new)
 */

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { usePatientList } from "@/hooks/usePatients";
import type { PatientSummary } from "@/types/patient";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Flag badge helper
// ---------------------------------------------------------------------------

function FlagBadge({
  active,
  label,
  color,
}: {
  active: boolean;
  label: string;
  color: string;
}) {
  if (!active) return null;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.125rem 0.5rem",
        borderRadius: "9999px",
        fontSize: "0.625rem",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        background: color,
        color: "white",
        marginRight: "0.25rem",
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Patient table row
// ---------------------------------------------------------------------------

function PatientRow({ patient }: { patient: PatientSummary }) {
  return (
    <tr
      style={{
        borderBottom: "1px solid #f1f5f9",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLTableRowElement).style.background = "#f8fafc")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLTableRowElement).style.background = "white")
      }
    >
      {/* Patient Code */}
      <td
        style={{
          padding: "0.75rem 1rem",
          fontSize: "0.875rem",
          fontFamily: "monospace",
          color: "#0f172a",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        {patient.patientCode}
      </td>

      {/* Full Name */}
      <td style={{ padding: "0.75rem 1rem" }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0f172a" }}>
          {patient.fullName}
        </div>
      </td>

      {/* Age / Sex */}
      <td
        style={{
          padding: "0.75rem 1rem",
          fontSize: "0.875rem",
          color: "#475569",
          whiteSpace: "nowrap",
        }}
      >
        {patient.age} / {patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1)}
      </td>

      {/* Contact No. */}
      <td
        style={{
          padding: "0.75rem 1rem",
          fontSize: "0.875rem",
          color: "#475569",
        }}
      >
        {patient.mobileNumber ?? (
          <span style={{ color: "#cbd5e1", fontStyle: "italic" }}>—</span>
        )}
      </td>

      {/* Flags */}
      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
        <FlagBadge active={patient.isSenior} label="Senior" color="#8b5cf6" />
        <FlagBadge active={patient.isPwd} label="PWD" color="#0891b2" />
        <FlagBadge active={patient.isPregnant} label="Pregnant" color="#db2777" />
        {!patient.isSenior && !patient.isPwd && !patient.isPregnant && (
          <span style={{ color: "#cbd5e1", fontSize: "0.75rem" }}>—</span>
        )}
      </td>

      {/* Actions */}
      <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
        <Link
          href={`/patients/${patient.id}`}
          style={{
            display: "inline-block",
            padding: "0.375rem 0.875rem",
            background: "#0f172a",
            color: "white",
            borderRadius: "0.375rem",
            fontSize: "0.75rem",
            fontWeight: 500,
            textDecoration: "none",
          }}
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

  // Debounce the search input so we don't fire on every keystroke
  const q = useDebounced(searchInput, 300);

  // Reset page when search/filters change
  useEffect(() => {
    setPage(1);
  }, [q, filterSenior, filterPwd, filterPregnant]);

  const { data, loading, error } = usePatientList({
    q: q || undefined,
    page,
    pageSize: PAGE_SIZE,
    isSenior: filterSenior,
    isPwd: filterPwd,
    isPregnant: filterPregnant,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  // ---------------------------------------------------------------------------
  // Toggle helper
  // ---------------------------------------------------------------------------
  function toggleFilter(
    current: boolean | undefined,
    setter: (v: boolean | undefined) => void
  ) {
    if (current === undefined) setter(true);
    else if (current === true) setter(false);
    else setter(undefined);
  }

  function filterButtonStyle(active: boolean | undefined, activeColor: string) {
    const base: React.CSSProperties = {
      padding: "0.375rem 0.75rem",
      borderRadius: "0.375rem",
      fontSize: "0.75rem",
      fontWeight: 500,
      border: "1px solid",
      cursor: "pointer",
      transition: "all 0.15s",
    };
    if (active === true)
      return { ...base, background: activeColor, color: "white", borderColor: activeColor };
    if (active === false)
      return { ...base, background: "#fef2f2", color: "#dc2626", borderColor: "#fca5a5" };
    return { ...base, background: "white", color: "#64748b", borderColor: "#e2e8f0" };
  }

  return (
    <div>
      {/* Controls bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        {/* Search */}
        <input
          type="search"
          placeholder="Search by name, code, or mobile..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search patients"
          style={{
            flex: "1 1 250px",
            padding: "0.5rem 0.875rem",
            border: "1px solid #e2e8f0",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
            color: "#0f172a",
            outline: "none",
            minWidth: 200,
          }}
        />

        {/* Flag filters */}
        <button
          onClick={() => toggleFilter(filterSenior, setFilterSenior)}
          style={filterButtonStyle(filterSenior, "#8b5cf6")}
          title="Toggle Senior filter (click for Yes, again for No, again to clear)"
        >
          Senior {filterSenior === true ? "✓" : filterSenior === false ? "✗" : ""}
        </button>
        <button
          onClick={() => toggleFilter(filterPwd, setFilterPwd)}
          style={filterButtonStyle(filterPwd, "#0891b2")}
          title="Toggle PWD filter"
        >
          PWD {filterPwd === true ? "✓" : filterPwd === false ? "✗" : ""}
        </button>
        <button
          onClick={() => toggleFilter(filterPregnant, setFilterPregnant)}
          style={filterButtonStyle(filterPregnant, "#db2777")}
          title="Toggle Pregnant filter"
        >
          Pregnant {filterPregnant === true ? "✓" : filterPregnant === false ? "✗" : ""}
        </button>

        {/* Register button */}
        <Link
          href="/patients/new"
          style={{
            marginLeft: "auto",
            padding: "0.5rem 1rem",
            background: "#14b8a6",
            color: "white",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          + Register Patient
        </Link>
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: "1rem",
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: "0.375rem",
            color: "#dc2626",
            fontSize: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          {error.message}
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: "0.5rem",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
              {["Patient Code", "Full Name", "Age / Sex", "Contact No.", "Flags", ""].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      padding: "0.625rem 1rem",
                      textAlign: h === "" ? "right" : "left",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: "3rem",
                    textAlign: "center",
                    color: "#94a3b8",
                    fontSize: "0.875rem",
                  }}
                >
                  Loading...
                </td>
              </tr>
            )}
            {!loading && data && data.items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: "3rem",
                    textAlign: "center",
                    color: "#94a3b8",
                    fontSize: "0.875rem",
                  }}
                >
                  {q ? `No patients match "${q}"` : "No patients registered yet."}
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((p) => <PatientRow key={p.id} patient={p} />)}
          </tbody>
        </table>
      </div>

      {/* Pagination + count */}
      {data && data.total > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "1rem",
            fontSize: "0.875rem",
            color: "#64748b",
          }}
        >
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, data.total)} of {data.total} patient
            {data.total !== 1 ? "s" : ""}
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: "0.375rem 0.75rem",
                border: "1px solid #e2e8f0",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                cursor: page <= 1 ? "not-allowed" : "pointer",
                background: "white",
                color: page <= 1 ? "#cbd5e1" : "#0f172a",
              }}
            >
              Previous
            </button>
            <span
              style={{
                padding: "0.375rem 0.75rem",
                fontSize: "0.875rem",
                color: "#0f172a",
              }}
            >
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: "0.375rem 0.75rem",
                border: "1px solid #e2e8f0",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
                background: "white",
                color: page >= totalPages ? "#cbd5e1" : "#0f172a",
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
