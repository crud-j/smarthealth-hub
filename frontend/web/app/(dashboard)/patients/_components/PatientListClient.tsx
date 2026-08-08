"use client";
/**
 * PatientListClient — interactive patient list with search, filters, and
 * pagination.
 *
 * This Client Component is responsible for:
 *   - Search input that debounces and passes ``q`` to ``usePatientList``
 *   - Flag filter toggles (Senior, PWD, Pregnant)
 *   - Rendering the patient table with a selectable checkbox column
 *   - "Print Selected" batch PDF button (admin/bhw only, up to 50 patients)
 *   - Pagination controls
 *   - "Register Patient" button (links to /patients/new)
 */

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePatientList, useBatchPdf } from "@/hooks/usePatients";
import { useCurrentUser } from "@/hooks/useAuth";
import { useGenerateIntakeToken, usePendingIntakes } from "@/hooks/useIntake";
import { apiFetch } from "@/lib/api-client";
import type { PendingIntakeSummary } from "@/hooks/useIntake";
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
// Pending intakes panel
// ---------------------------------------------------------------------------

function PendingIntakesPanel({
  items,
  onFinalize,
  finalizingToken,
}: {
  items: PendingIntakeSummary[];
  onFinalize: (token: string) => void;
  finalizingToken: string | null;
}) {
  const submitted = items.filter((i) => i.has_draft);
  const waiting = items.filter((i) => !i.has_draft);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        background: "#fffbeb",
        border: "1px solid #fde68a",
        borderRadius: "0.75rem",
        padding: "1rem 1.25rem",
        marginBottom: "1.25rem",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#92400e", marginBottom: "0.75rem" }}>
        Pending Pre-Visit Intakes ({items.length})
      </div>

      {submitted.length > 0 && (
        <>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#78350f", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Ready to finalize ({submitted.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
            {submitted.map((item) => (
              <div
                key={item.token}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "white",
                  border: "1px solid #fde68a",
                  borderRadius: "0.5rem",
                  padding: "0.625rem 0.875rem",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "#1a0808" }}>
                    {item.patient_name ?? "Patient (name pending)"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#78350f" }}>
                    Form submitted · expires {new Date(item.expires_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
                <button
                  onClick={() => onFinalize(item.token)}
                  disabled={finalizingToken === item.token}
                  style={{
                    padding: "0.4rem 1rem",
                    background: finalizingToken === item.token
                      ? "#d4a0a0"
                      : "linear-gradient(135deg, #166534, #15803d)",
                    color: "white",
                    border: "none",
                    borderRadius: "0.375rem",
                    fontWeight: 700,
                    fontSize: "0.8125rem",
                    cursor: finalizingToken === item.token ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {finalizingToken === item.token ? "Finalizing..." : "Finalize →"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {waiting.length > 0 && (
        <>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#78350f", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Waiting for patient ({waiting.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {waiting.map((item) => (
              <div
                key={item.token}
                style={{
                  fontSize: "0.8125rem",
                  color: "#92400e",
                  padding: "0.375rem 0.5rem",
                  background: "rgba(254,243,199,0.5)",
                  borderRadius: "0.375rem",
                }}
              >
                Link sent · expires {new Date(item.expires_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intake link modal
// ---------------------------------------------------------------------------

function IntakeLinkModal({
  intakeUrl,
  expiresAt,
  onClose,
}: {
  intakeUrl: string;
  expiresAt: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(intakeUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  const expiryDate = new Date(expiresAt).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: "1rem",
          padding: "1.5rem",
          maxWidth: 520,
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#1a0808", margin: 0 }}>
            Pre-Visit Form Link
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer", color: "#6b7280", lineHeight: 1 }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <p style={{ fontSize: "0.8125rem", color: "#475569", marginBottom: "1rem", lineHeight: 1.5 }}>
          Share this link with the patient. They can fill in their details on their own device before arriving.
          The link expires on <strong>{expiryDate}</strong> and can only be used once.
        </p>

        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "0.5rem",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            wordBreak: "break-all",
            fontSize: "0.8125rem",
            color: "#0f172a",
            fontFamily: "monospace",
          }}
        >
          {intakeUrl}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            onClick={handleCopy}
            style={{
              padding: "0.5rem 1.25rem",
              background: copied
                ? "linear-gradient(135deg, #166534, #15803d)"
                : "linear-gradient(135deg, #0f766e, #0d9488)",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              fontWeight: 700,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            {copied ? "✓ Copied!" : "Copy Link"}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "0.5rem 1.25rem",
              background: "white",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <p style={{ marginTop: "0.75rem", fontSize: "0.7rem", color: "#9ca3af" }}>
          After the patient submits, find their draft in Patients → Pending Intake and click Finalize to create the record.
        </p>
      </div>
    </div>
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
    <tr
      style={{
        borderBottom: "1px solid #f0e4dd",
        transition: "background 0.1s",
        background: selected ? "#fff0ee" : "white",
      }}
      onMouseEnter={(e) => {
        if (!selected)
          (e.currentTarget as HTMLTableRowElement).style.background = "#fdf5f0";
      }}
      onMouseLeave={(e) => {
        if (!selected)
          (e.currentTarget as HTMLTableRowElement).style.background = "white";
      }}
    >
      {/* Checkbox — only rendered for roles that can batch-print */}
      {showCheckbox && (
        <td
          style={{ padding: "0.75rem 0.75rem", textAlign: "center", width: "2.5rem" }}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggle(patient.id, e.target.checked)}
            aria-label={`Select ${patient.fullName}`}
            style={{ cursor: "pointer", width: "1rem", height: "1rem" }}
          />
        </td>
      )}

      {/* Patient Code */}
      <td
        style={{
          padding: "0.75rem 1rem",
          fontSize: "0.875rem",
          fontFamily: "monospace",
          color: "#1a0808",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        {patient.patientCode}
      </td>

      {/* Full Name */}
      <td style={{ padding: "0.75rem 1rem" }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1a0808" }}>
          {patient.fullName}
        </div>
      </td>

      {/* Age / Sex */}
      <td
        style={{
          padding: "0.75rem 1rem",
          fontSize: "0.875rem",
          color: "#7a5252",
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
          color: "#7a5252",
        }}
      >
        {patient.mobileNumber ?? (
          <span style={{ color: "#d4b0b0", fontStyle: "italic" }}>—</span>
        )}
      </td>

      {/* Flags */}
      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
        <FlagBadge active={patient.isSenior} label="Senior" color="#8b5cf6" />
        <FlagBadge active={patient.isPwd} label="PWD" color="#0891b2" />
        <FlagBadge active={patient.isPregnant} label="Pregnant" color="#db2777" />
        {!patient.isSenior && !patient.isPwd && !patient.isPregnant && (
          <span style={{ color: "#d4b0b0", fontSize: "0.75rem" }}>—</span>
        )}
      </td>

      {/* Actions */}
      <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
        <Link
          href={`/patients/${patient.id}`}
          style={{
            display: "inline-block",
            padding: "0.375rem 0.875rem",
            background: "linear-gradient(135deg, #b5343e, #c94060)",
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

// Maximum patients that can be batch-printed in a single request.
const BATCH_PRINT_MAX = 50;

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

  // Selection state: Set of patient UUIDs selected for batch print.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Warning shown when the user tries to select more than BATCH_PRINT_MAX patients.
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);

  // Batch PDF hook (admin/bhw only — role check below gates the button).
  const { printBatch, loading: batchLoading } = useBatchPdf();

  // Intake token generation
  const { generate: generateIntake, loading: intakeLoading, result: intakeResult, clear: clearIntake } = useGenerateIntakeToken();
  const [showIntakeModal, setShowIntakeModal] = useState(false);

  async function handleGenerateIntake() {
    const data = await generateIntake();
    if (data) setShowIntakeModal(true);
  }

  // Pending intakes
  const { data: pendingIntakes, refresh: refreshPending } = usePendingIntakes();
  const [finalizingToken, setFinalizingToken] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const handleFinalize = useCallback(async (token: string) => {
    setFinalizingToken(token);
    setFinalizeError(null);
    try {
      await apiFetch(`/intake/${token}/finalize`, { method: "POST" });
      await refreshPending();
      setPage(1);
    } catch (err) {
      setFinalizeError(err instanceof Error ? err.message : "Finalization failed.");
    } finally {
      setFinalizingToken(null);
    }
  }, [refreshPending]);

  // Current user — used to gate buttons by role.
  const { user } = useCurrentUser();
  const canBatchPrint =
    user?.role === "admin" || user?.role === "bhw";
  // BHW, physician, admin_staff, and admin can generate intake links.
  const canGenerateIntake =
    user?.role === "admin" ||
    user?.role === "bhw" ||
    user?.role === "physician" ||
    user?.role === "admin_staff";

  // Debounce the search input so we don't fire on every keystroke.
  const q = useDebounced(searchInput, 300);

  // Reset page when search/filters change.
  useEffect(() => {
    setPage(1);
  }, [q, filterSenior, filterPwd, filterPregnant]);

  // Clear selection when filters / search / page changes (avoids cross-page
  // selection confusion where the user doesn't see which rows are selected).
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

  // IDs visible on the current page.
  const pageIds: string[] = data?.items.map((p) => p.id) ?? [];

  // Master-select state: true when all visible rows are selected.
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected =
    !allPageSelected && pageIds.some((id) => selectedIds.has(id));

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------

  const handleRowToggle = useCallback(
    (id: string, checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) {
          if (next.size >= BATCH_PRINT_MAX) {
            setSelectionWarning(
              `Maximum ${BATCH_PRINT_MAX} patients can be selected for batch print.`
            );
            return prev; // reject the addition
          }
          next.add(id);
        } else {
          next.delete(id);
        }
        if (next.size < BATCH_PRINT_MAX) setSelectionWarning(null);
        return next;
      });
    },
    []
  );

  const handleMasterToggle = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) {
          // Only add page rows that won't push us over the cap.
          for (const id of pageIds) {
            if (next.size >= BATCH_PRINT_MAX) {
              setSelectionWarning(
                `Maximum ${BATCH_PRINT_MAX} patients can be selected for batch print.`
              );
              break;
            }
            next.add(id);
          }
        } else {
          for (const id of pageIds) {
            next.delete(id);
          }
          setSelectionWarning(null);
        }
        return next;
      });
    },
    [pageIds]
  );

  // ---------------------------------------------------------------------------
  // Filter toggle helpers
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
    return { ...base, background: "white", color: "#9b6e6e", borderColor: "#e5d4cc" };
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
            border: "1px solid #e5d4cc",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
            color: "#1a0808",
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

        {/* "Print Selected" button — admin/bhw only, visible when ≥1 selected */}
        {canBatchPrint && selectedIds.size >= 1 && (
          <button
            onClick={() => void printBatch([...selectedIds])}
            disabled={batchLoading}
            title={`Print health cards for ${selectedIds.size} selected patient${selectedIds.size !== 1 ? "s" : ""}`}
            style={{
              padding: "0.5rem 1rem",
              background: batchLoading ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)",
              color: "white",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              border: "none",
              cursor: batchLoading ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              transition: "background 0.15s",
            }}
          >
            {batchLoading ? (
              <>
                {/* Inline CSS spinner — no external component dependency */}
                <span
                  style={{
                    display: "inline-block",
                    width: "0.875rem",
                    height: "0.875rem",
                    border: "2px solid rgba(255,255,255,0.4)",
                    borderTopColor: "white",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                  }}
                  aria-hidden="true"
                />
                Generating...
              </>
            ) : (
              `Print Selected (${selectedIds.size})`
            )}
          </button>
        )}

        {/* Send pre-visit form link button */}
        {canGenerateIntake && (
          <button
            onClick={() => void handleGenerateIntake()}
            disabled={intakeLoading}
            style={{
              marginLeft: "auto",
              padding: "0.5rem 1rem",
              background: intakeLoading
                ? "#94a3b8"
                : "linear-gradient(135deg, #0f766e, #0d9488)",
              color: "white",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              border: "none",
              cursor: intakeLoading ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {intakeLoading ? "Generating..." : "Send Pre-Visit Form"}
          </button>
        )}

        {/* Register button */}
        <Link
          href="/patients/new"
          style={{
            marginLeft: canGenerateIntake ? "0" : "auto",
            padding: "0.5rem 1rem",
            background: "linear-gradient(135deg, #b5343e, #c94060)",
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

      {/* Intake link modal */}
      {showIntakeModal && intakeResult && (
        <IntakeLinkModal
          intakeUrl={intakeResult.intake_url}
          expiresAt={intakeResult.expires_at}
          onClose={() => { setShowIntakeModal(false); clearIntake(); }}
        />
      )}

      {/* Inline keyframes for spinner — injected once in the DOM */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Pending intakes panel */}
      {canGenerateIntake && pendingIntakes.length > 0 && (
        <PendingIntakesPanel
          items={pendingIntakes}
          onFinalize={(token) => void handleFinalize(token)}
          finalizingToken={finalizingToken}
        />
      )}

      {/* Finalize error */}
      {finalizeError && (
        <div style={{ padding: "0.625rem 1rem", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "0.375rem", color: "#991b1b", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
          {finalizeError}
        </div>
      )}

      {/* Selection cap warning */}
      {selectionWarning && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            borderRadius: "0.375rem",
            color: "#92400e",
            fontSize: "0.875rem",
            marginBottom: "0.75rem",
          }}
          role="alert"
        >
          {selectionWarning}
        </div>
      )}

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
          border: "1px solid #e5d4cc",
          borderRadius: "1rem",
          overflow: "hidden",
          boxShadow: "0 2px 10px rgba(160,80,80,0.06)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "linear-gradient(135deg, #fdf0eb 0%, #ffffff 100%)", borderBottom: "2px solid #e5d4cc" }}>
              {/* Master checkbox column — only for admin/bhw */}
              {canBatchPrint && (
                <th
                  style={{
                    padding: "0.625rem 0.75rem",
                    textAlign: "center",
                    width: "2.5rem",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected;
                    }}
                    onChange={(e) => handleMasterToggle(e.target.checked)}
                    aria-label="Select all patients on this page"
                    style={{ cursor: "pointer", width: "1rem", height: "1rem" }}
                    disabled={pageIds.length === 0}
                  />
                </th>
              )}
              {["Patient Code", "Full Name", "Age / Sex", "Contact No.", "Flags", ""].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      padding: "0.625rem 1rem",
                      textAlign: h === "" ? "right" : "left",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#9b6e6e",
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
                  colSpan={canBatchPrint ? 7 : 6}
                  style={{
                    padding: "3rem",
                    textAlign: "center",
                    color: "#b09090",
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
                  colSpan={canBatchPrint ? 7 : 6}
                  style={{
                    padding: "3rem",
                    textAlign: "center",
                    color: "#b09090",
                    fontSize: "0.875rem",
                  }}
                >
                  {q ? `No patients match "${q}"` : "No patients registered yet."}
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((p) => (
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

      {/* Pagination + count */}
      {data && data.total > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "1rem",
            fontSize: "0.875rem",
            color: "#9b6e6e",
          }}
        >
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, data.total)} of {data.total} patient
            {data.total !== 1 ? "s" : ""}
            {selectedIds.size > 0 && (
              <span style={{ marginLeft: "0.5rem", color: "#c94040", fontWeight: 500 }}>
                ({selectedIds.size} selected)
              </span>
            )}
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: "0.375rem 0.75rem",
                border: "1px solid #e5d4cc",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                cursor: page <= 1 ? "not-allowed" : "pointer",
                background: "white",
                color: page <= 1 ? "#d4b0b0" : "#1a0808",
              }}
            >
              Previous
            </button>
            <span
              style={{
                padding: "0.375rem 0.75rem",
                fontSize: "0.875rem",
                color: "#1a0808",
              }}
            >
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: "0.375rem 0.75rem",
                border: "1px solid #e5d4cc",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
                background: "white",
                color: page >= totalPages ? "#d4b0b0" : "#1a0808",
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
