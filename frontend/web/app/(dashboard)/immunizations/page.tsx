"use client";

/**
 * Immunizations tracking page — Phase 2.
 *
 * Features:
 *  - Stats bar: Total Records, Due This Week, Due This Month, Vaccines Covered
 *  - Paginated cross-patient immunization table with vaccine + due-date filters
 *  - Status badges: Completed / Scheduled / Due Soon / Overdue
 *  - "Due Soon" sidebar panel (next 5 within 7 days)
 *  - Add Immunization modal (patient search → POST /patients/{id}/immunizations)
 *  - Edit Immunization modal (pre-populated → PATCH)
 *  - Delete action (Physician / Admin only — 204 on success)
 *
 * All API calls go through useImmunizations.ts hooks.
 * Styling matches existing dashboard pages (inline styles, same color palette).
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  useImmunizationList,
  useImmunizationDueSummary,
  useImmunizationStats,
  useCreateImmunization,
  useUpdateImmunization,
  useDeleteImmunization,
  type Immunization,
  type ImmunizationListParams,
  type ImmunizationCreatePayload,
  type ImmunizationUpdatePayload,
} from "@/hooks/useImmunizations";
import { usePatientList } from "@/hooks/usePatients";
import { useCurrentUser } from "@/hooks/useAuth";
import { swSuccess, swError, swConfirm } from "@/lib/swal";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VACCINE_NAMES = [
  "BCG",
  "Hepatitis B",
  "OPV",
  "DPT-HepB-Hib",
  "MMR",
  "Flu",
  "COVID-19",
  "Tetanus",
  "Others",
] as const;

type DueFilter = "due_this_week" | "due_this_month" | "overdue" | "";

// ---------------------------------------------------------------------------
// Status badge logic
// ---------------------------------------------------------------------------

function getStatusBadge(imm: Immunization): {
  label: string;
  bg: string;
  color: string;
} {
  if (imm.status === "completed") {
    return { label: "Completed", bg: "#dcfce7", color: "#15803d" };
  }
  if (imm.status === "missed") {
    return { label: "Missed", bg: "#fee2e2", color: "#b91c1c" };
  }
  if (imm.status === "cancelled") {
    return { label: "Cancelled", bg: "#f1f5f9", color: "#64748b" };
  }
  if (!imm.nextDueDate) {
    return { label: "Scheduled", bg: "#dbeafe", color: "#1d4ed8" };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(imm.nextDueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) return { label: "Overdue", bg: "#fee2e2", color: "#b91c1c" };
  if (diffDays <= 7) return { label: "Due Soon", bg: "#fef9c3", color: "#a16207" };
  return { label: "Scheduled", bg: "#dbeafe", color: "#1d4ed8" };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: number | string;
  accent?: string;
}

function StatCard({ label, value, accent = "#2563eb" }: StatCardProps) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e5d4cc",
        borderRadius: "0.875rem",
        padding: "1.25rem 1.5rem",
        boxShadow: "0 2px 8px rgba(160,80,80,0.06)",
        borderTop: `3px solid ${accent}`,
        flex: "1 1 180px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: "1.75rem",
          fontWeight: 700,
          color: "#1a0808",
          lineHeight: 1,
          marginBottom: "0.375rem",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "0.75rem",
          color: "#9b6e6e",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / Edit Immunization Modal
// ---------------------------------------------------------------------------

interface ImmunizationModalProps {
  mode: "add" | "edit";
  initial?: Immunization | null;
  onClose: () => void;
  onSaved: () => void;
}

function ImmunizationModal({ mode, initial, onClose, onSaved }: ImmunizationModalProps) {
  // Patient search for "add" mode
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initial?.patientId ?? "");
  const [selectedPatientName, setSelectedPatientName] = useState<string>(initial?.patientName ?? "");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);

  const { data: patientResults, loading: patientSearchLoading } = usePatientList(
    patientSearch.trim().length >= 2 ? { q: patientSearch, pageSize: 8 } : {}
  );

  // Form state
  const [vaccineName, setVaccineName] = useState(initial?.vaccineName ?? "");
  const [doseNumber, setDoseNumber] = useState<number>(initial?.doseNumber ?? 1);
  const [dateAdministered, setDateAdministered] = useState<string>(
    initial?.dateAdministered ?? todayIso()
  );
  const [nextDueDate, setNextDueDate] = useState<string>(initial?.nextDueDate ?? "");
  const [batchNumber, setBatchNumber] = useState(initial?.batchNumber ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState(initial?.status ?? "scheduled");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const { createImmunization } = useCreateImmunization();
  const { updateImmunization } = useUpdateImmunization();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);

    if (mode === "add" && !selectedPatientId) {
      setFieldError("Please select a patient.");
      return;
    }
    if (!vaccineName) {
      setFieldError("Please select a vaccine name.");
      return;
    }
    if (doseNumber < 1) {
      setFieldError("Dose number must be at least 1.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: ImmunizationCreatePayload & ImmunizationUpdatePayload = {
        vaccine_name: vaccineName,
        dose_number: doseNumber,
        date_administered: dateAdministered || null,
        next_due_date: nextDueDate || null,
        batch_number: batchNumber || null,
        notes: notes || null,
        status,
      };

      if (mode === "add") {
        const result = await createImmunization(selectedPatientId, payload);
        if (result) {
          void swSuccess("Immunization record added successfully.");
          onSaved();
          onClose();
        } else {
          setFieldError("Failed to add immunization record. Please try again.");
        }
      } else if (initial) {
        const result = await updateImmunization(initial.patientId, initial.id, payload);
        if (result) {
          void swSuccess("Immunization record updated successfully.");
          onSaved();
          onClose();
        } else {
          setFieldError("Failed to update immunization record. Please try again.");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.75rem",
    border: "1px solid #e2d5cc",
    borderRadius: "0.375rem",
    fontSize: "0.875rem",
    color: "#1a0808",
    background: "white",
    boxSizing: "border-box",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#7a5252",
    marginBottom: "0.25rem",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

  const fieldStyle: React.CSSProperties = {
    marginBottom: "1rem",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(2px)",
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "add" ? "Add Immunization Record" : "Edit Immunization Record"}
        style={{
          position: "relative",
          zIndex: 1,
          background: "white",
          borderRadius: "1rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #f0e4dd",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "1rem",
              fontWeight: 700,
              color: "#1a0808",
              borderLeft: "3px solid #b5343e",
              paddingLeft: "0.625rem",
            }}
          >
            {mode === "add" ? "Add Immunization Record" : "Edit Immunization Record"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#9b6e6e",
              fontSize: "1.25rem",
              lineHeight: 1,
              padding: "0.25rem",
            }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: "1.5rem" }}>
          {/* Patient selector — add mode only */}
          {mode === "add" && (
            <div style={{ ...fieldStyle, position: "relative" }}>
              <label style={labelStyle} htmlFor="modal-patient-search">
                Patient *
              </label>
              {selectedPatientId ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 0.75rem",
                    border: "1px solid #b5343e",
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                    color: "#1a0808",
                    background: "#fdf5f0",
                  }}
                >
                  <span style={{ flex: 1, fontWeight: 500 }}>{selectedPatientName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatientId("");
                      setSelectedPatientName("");
                      setPatientSearch("");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#b5343e",
                      fontWeight: 700,
                      fontSize: "0.875rem",
                    }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    id="modal-patient-search"
                    type="text"
                    placeholder="Type patient name to search..."
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      setShowPatientDropdown(true);
                    }}
                    onFocus={() => setShowPatientDropdown(true)}
                    style={inputStyle}
                    autoComplete="off"
                  />
                  {showPatientDropdown && patientSearch.trim().length >= 2 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        zIndex: 50,
                        background: "white",
                        border: "1px solid #e2d5cc",
                        borderRadius: "0.375rem",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        maxHeight: 200,
                        overflowY: "auto",
                        marginTop: 2,
                      }}
                    >
                      {patientSearchLoading && (
                        <div style={{ padding: "0.75rem 1rem", color: "#9b6e6e", fontSize: "0.875rem" }}>
                          Searching...
                        </div>
                      )}
                      {!patientSearchLoading &&
                        (patientResults?.items ?? []).length === 0 && (
                          <div style={{ padding: "0.75rem 1rem", color: "#b09090", fontSize: "0.875rem" }}>
                            No patients found.
                          </div>
                        )}
                      {(patientResults?.items ?? []).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedPatientId(p.id);
                            setSelectedPatientName(p.fullName);
                            setPatientSearch("");
                            setShowPatientDropdown(false);
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "0.625rem 1rem",
                            textAlign: "left",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.875rem",
                            color: "#1a0808",
                            borderBottom: "1px solid #f0e4dd",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = "#fdf5f0";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = "";
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{p.fullName}</span>
                          <span style={{ marginLeft: "0.5rem", color: "#9b6e6e", fontSize: "0.75rem" }}>
                            {p.patientCode}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Vaccine Name */}
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="modal-vaccine-name">
              Vaccine Name *
            </label>
            <select
              id="modal-vaccine-name"
              value={vaccineName}
              onChange={(e) => setVaccineName(e.target.value)}
              style={inputStyle}
              required
            >
              <option value="">Select vaccine...</option>
              {VACCINE_NAMES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* Dose Number + Status — 2 columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={labelStyle} htmlFor="modal-dose-number">
                Dose Number *
              </label>
              <input
                id="modal-dose-number"
                type="number"
                min={1}
                max={10}
                value={doseNumber}
                onChange={(e) => setDoseNumber(Number(e.target.value))}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="modal-status">
                Status
              </label>
              <select
                id="modal-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={inputStyle}
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="missed">Missed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Date Administered + Next Due Date — 2 columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={labelStyle} htmlFor="modal-date-administered">
                Date Administered
              </label>
              <input
                id="modal-date-administered"
                type="date"
                value={dateAdministered}
                onChange={(e) => setDateAdministered(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="modal-next-due-date">
                Next Due Date
              </label>
              <input
                id="modal-next-due-date"
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Batch Number */}
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="modal-batch-number">
              Batch / Lot Number
            </label>
            <input
              id="modal-batch-number"
              type="text"
              placeholder="Optional"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              style={inputStyle}
              maxLength={50}
            />
          </div>

          {/* Notes */}
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="modal-notes">
              Notes
            </label>
            <textarea
              id="modal-notes"
              placeholder="Optional clinical notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {/* Field validation error */}
          {fieldError && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.625rem 0.875rem",
                background: "#fef2f2",
                border: "1px solid #fca5a5",
                borderRadius: "0.375rem",
                color: "#dc2626",
                fontSize: "0.875rem",
              }}
            >
              {fieldError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "0.5rem 1.25rem",
                border: "1px solid #e5d4cc",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "#3d2222",
                background: "white",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "0.5rem 1.25rem",
                background: submitting
                  ? "#fca5a5"
                  : "linear-gradient(135deg, #b5343e, #c94060)",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "white",
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Saving..." : mode === "add" ? "Add Record" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Due Soon panel — uses the cross-patient list endpoint to get patient names
// ---------------------------------------------------------------------------

function DueSoonPanel({ onViewAll }: { onViewAll: () => void }) {
  const { data, loading } = useImmunizationList({ dueFilter: "due_this_week", pageSize: 5 });
  const items = data?.items ?? [];

  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e5d4cc",
        borderRadius: "0.875rem",
        boxShadow: "0 2px 8px rgba(160,80,80,0.06)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "0.875rem 1.125rem",
          borderBottom: "1px solid #f0e4dd",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "#1a0808",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            borderLeft: "3px solid #b5343e",
            paddingLeft: "0.5rem",
          }}
        >
          Due Within 7 Days
        </span>
        <button
          type="button"
          onClick={onViewAll}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "0.75rem",
            color: "#2563eb",
            fontWeight: 500,
          }}
        >
          View All
        </button>
      </div>

      {loading && (
        <div style={{ padding: "1.25rem", textAlign: "center", color: "#b09090", fontSize: "0.8125rem" }}>
          Loading...
        </div>
      )}
      {!loading && items.length === 0 && (
        <div style={{ padding: "1.25rem", textAlign: "center", color: "#b09090", fontSize: "0.8125rem" }}>
          No immunizations due within 7 days.
        </div>
      )}
      {!loading &&
        items.map((imm) => {
          const badge = getStatusBadge(imm);
          return (
            <div
              key={imm.id}
              style={{
                padding: "0.75rem 1.125rem",
                borderBottom: "1px solid #f5eeea",
                display: "flex",
                flexDirection: "column",
                gap: "0.125rem",
              }}
            >
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1a0808" }}>
                {imm.vaccineName}
                <span style={{ fontWeight: 400, color: "#9b6e6e" }}> — Dose {imm.doseNumber}</span>
              </div>
              <Link
                href={`/patients/${imm.patientId}`}
                style={{ fontSize: "0.75rem", color: "#2563eb", textDecoration: "none", fontWeight: 500 }}
              >
                {imm.patientName ?? "Unknown patient"}
              </Link>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.125rem" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "0.125rem 0.5rem",
                    borderRadius: "9999px",
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    background: badge.bg,
                    color: badge.color,
                  }}
                >
                  {badge.label}
                </span>
                <span style={{ fontSize: "0.6875rem", color: "#9b6e6e" }}>
                  Due: {formatDate(imm.nextDueDate)}
                </span>
              </div>
            </div>
          );
        })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function ImmunizationsPage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const { user: currentUser } = useCurrentUser();
  const canWrite = ["admin", "bhw", "physician"].includes(currentUser?.role ?? "");
  const canDelete = ["admin", "physician"].includes(currentUser?.role ?? "");

  // ── Filter state ──────────────────────────────────────────────────────────
  const [vaccineName, setVaccineName] = useState<string>("");
  const [dueFilter, setDueFilter] = useState<DueFilter>("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const listParams: ImmunizationListParams = {
    vaccineName: vaccineName || undefined,
    dueFilter: dueFilter || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  // ── Data hooks ────────────────────────────────────────────────────────────
  const { data, loading, error, refetch } = useImmunizationList(listParams);
  const { data: dueSummary } = useImmunizationDueSummary();
  const { data: stats } = useImmunizationStats();
  const { deleteImmunization, loading: deleting } = useDeleteImmunization();

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Immunization | null>(null);

  // Surface fetch errors as toast (non-blocking)
  useEffect(() => {
    if (error) {
      void swError(`Failed to load immunizations: ${error.message}`);
    }
  }, [error]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function applyFilters() {
    setPage(1);
  }

  function resetFilters() {
    setVaccineName("");
    setDueFilter("");
    setPage(1);
  }

  function viewDueThisWeek() {
    setDueFilter("due_this_week");
    setPage(1);
  }

  async function handleDelete(imm: Immunization) {
    const result = await swConfirm({
      title: "Delete immunization record?",
      text: `This will permanently remove the ${imm.vaccineName} (Dose ${imm.doseNumber}) record. This action cannot be undone.`,
      confirmLabel: "Yes, delete it",
      isDangerous: true,
    });
    if (!result.isConfirmed) return;
    const ok = await deleteImmunization(imm.patientId, imm.id);
    if (ok) {
      void swSuccess("Immunization record deleted.");
      refetch();
    } else {
      void swError("Failed to delete the record. Please try again.");
    }
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  // ── Derived display values ────────────────────────────────────────────────
  const totalRecords = stats?.totalRecords ?? 0;
  const distinctVaccines = stats?.distinctVaccines ?? 0;
  const dueThisWeek = dueSummary?.dueThisWeek ?? 0;
  const dueThisMonth = dueSummary?.dueThisMonth ?? 0;

  return (
    <div>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontFamily: "var(--font-dm-serif, Georgia, serif)",
              fontWeight: 400,
              color: "#1a0808",
              marginBottom: "0.25rem",
              margin: 0,
            }}
          >
            Immunization Records
          </h1>
          <p style={{ color: "#7a5252", fontSize: "0.875rem", margin: "0.25rem 0 0" }}>
            Track vaccination schedules and immunization records
          </p>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              minHeight: 44,
              padding: "0.5rem 1.25rem",
              background: "linear-gradient(135deg, #b5343e, #c94060)",
              border: "none",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "white",
              cursor: "pointer",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Immunization
          </button>
        )}
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <StatCard label="Total Immunizations" value={totalRecords} accent="#2563eb" />
        <StatCard label="Due This Week" value={dueThisWeek} accent="#d97706" />
        <StatCard label="Due This Month" value={dueThisMonth} accent="#f59e0b" />
        <StatCard label="Vaccines Covered" value={distinctVaccines} accent="#16a34a" />
      </div>

      {/* ── Main layout: table + sidebar ────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 280px",
          gap: "1.25rem",
          alignItems: "start",
        }}
      >
        {/* ── Left: filter bar + table ─────────────────────────────────── */}
        <div>
          {/* Filter bar */}
          <div
            style={{
              background: "white",
              border: "1px solid #e5d4cc",
              borderRadius: "0.875rem",
              padding: "1rem 1.25rem",
              marginBottom: "1rem",
              boxShadow: "0 2px 8px rgba(160,80,80,0.04)",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              {/* Vaccine filter */}
              <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                <label
                  htmlFor="filter-vaccine"
                  style={{
                    display: "block",
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "#7a5252",
                    marginBottom: "0.25rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Vaccine
                </label>
                <select
                  id="filter-vaccine"
                  value={vaccineName}
                  onChange={(e) => setVaccineName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    border: "1px solid #e2d5cc",
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                    color: "#1a0808",
                    background: "white",
                  }}
                >
                  <option value="">All Vaccines</option>
                  {VACCINE_NAMES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              {/* Due filter */}
              <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                <label
                  htmlFor="filter-due"
                  style={{
                    display: "block",
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "#7a5252",
                    marginBottom: "0.25rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Due Status
                </label>
                <select
                  id="filter-due"
                  value={dueFilter}
                  onChange={(e) => setDueFilter(e.target.value as DueFilter)}
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    border: "1px solid #e2d5cc",
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                    color: "#1a0808",
                    background: "white",
                  }}
                >
                  <option value="">All Records</option>
                  <option value="due_this_week">Due This Week</option>
                  <option value="due_this_month">Due This Month</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={applyFilters}
                  style={{
                    minHeight: 36,
                    padding: "0.375rem 1rem",
                    background: "linear-gradient(135deg, #b5343e, #c94060)",
                    border: "none",
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Filter
                </button>
                {(vaccineName || dueFilter) && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    style={{
                      minHeight: 36,
                      padding: "0.375rem 0.75rem",
                      border: "1px solid #e5d4cc",
                      borderRadius: "0.375rem",
                      fontSize: "0.875rem",
                      color: "#7a5252",
                      background: "white",
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <div
            style={{
              background: "white",
              border: "1px solid #e5d4cc",
              borderRadius: "0.875rem",
              overflow: "hidden",
              boxShadow: "0 2px 10px rgba(160,80,80,0.06)",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}
                aria-label="Immunization records"
              >
                <thead>
                  <tr
                    style={{
                      background: "linear-gradient(135deg, #fdf0eb 0%, #ffffff 100%)",
                      borderBottom: "2px solid #e5d4cc",
                      textAlign: "left",
                    }}
                  >
                    {[
                      "Patient",
                      "Vaccine",
                      "Dose #",
                      "Date Given",
                      "Next Due",
                      "Status",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "0.75rem 1rem",
                          fontWeight: 600,
                          color: "#9b6e6e",
                          fontSize: "0.6875rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Loading skeleton */}
                  {loading &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f0e4dd" }}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j} style={{ padding: "0.75rem 1rem" }}>
                            <div
                              style={{
                                height: 14,
                                borderRadius: 4,
                                background: "#f0e4dd",
                                animation: "pulse 1.5s ease-in-out infinite",
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}

                  {/* Empty state */}
                  {!loading && (data?.items ?? []).length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          padding: "3rem 1rem",
                          textAlign: "center",
                          color: "#b09090",
                          fontSize: "0.875rem",
                        }}
                      >
                        {vaccineName || dueFilter
                          ? "No immunizations match the selected filters."
                          : "No immunization records found."}
                      </td>
                    </tr>
                  )}

                  {/* Rows */}
                  {!loading &&
                    (data?.items ?? []).map((imm) => {
                      const badge = getStatusBadge(imm);
                      return (
                        <tr
                          key={imm.id}
                          style={{ borderBottom: "1px solid #f0e4dd", transition: "background 0.1s" }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLTableRowElement).style.background = "#fdf5f0";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLTableRowElement).style.background = "";
                          }}
                        >
                          {/* Patient */}
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <Link
                              href={`/patients/${imm.patientId}`}
                              style={{
                                color: "#2563eb",
                                fontWeight: 500,
                                textDecoration: "none",
                                fontSize: "0.875rem",
                              }}
                            >
                              {imm.patientName ?? imm.patientId.slice(0, 8) + "..."}
                            </Link>
                          </td>

                          {/* Vaccine */}
                          <td
                            style={{
                              padding: "0.75rem 1rem",
                              fontWeight: 600,
                              color: "#1a0808",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {imm.vaccineName}
                          </td>

                          {/* Dose */}
                          <td
                            style={{
                              padding: "0.75rem 1rem",
                              color: "#7a5252",
                              textAlign: "center",
                            }}
                          >
                            {imm.doseNumber}
                          </td>

                          {/* Date Given */}
                          <td
                            style={{
                              padding: "0.75rem 1rem",
                              color: "#7a5252",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatDate(imm.dateAdministered)}
                          </td>

                          {/* Next Due */}
                          <td
                            style={{
                              padding: "0.75rem 1rem",
                              color: "#7a5252",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatDate(imm.nextDueDate)}
                          </td>

                          {/* Status badge */}
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.2rem 0.625rem",
                                borderRadius: "9999px",
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                                background: badge.bg,
                                color: badge.color,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {badge.label}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                              {canWrite && (
                                <button
                                  type="button"
                                  onClick={() => setEditTarget(imm)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: "0.8125rem",
                                    color: "#0891b2",
                                    fontWeight: 500,
                                    padding: 0,
                                  }}
                                >
                                  Edit
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(imm)}
                                  disabled={deleting}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    cursor: deleting ? "not-allowed" : "pointer",
                                    fontSize: "0.8125rem",
                                    color: "#dc2626",
                                    fontWeight: 500,
                                    padding: 0,
                                    opacity: deleting ? 0.5 : 1,
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                              <Link
                                href={`/patients/${imm.patientId}`}
                                style={{
                                  fontSize: "0.8125rem",
                                  color: "#7a5252",
                                  fontWeight: 500,
                                  textDecoration: "none",
                                }}
                              >
                                Patient
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.total > PAGE_SIZE && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1.25rem",
                  borderTop: "1px solid #e5d4cc",
                }}
              >
                <p style={{ fontSize: "0.75rem", color: "#9b6e6e", margin: 0 }}>
                  Showing{" "}
                  {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, data.total)} of {data.total} records
                </p>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    style={{
                      minHeight: 36,
                      padding: "0.375rem 0.875rem",
                      border: "1px solid #e5d4cc",
                      borderRadius: "0.375rem",
                      fontSize: "0.875rem",
                      color: page <= 1 ? "#d4b0b0" : "#3d2222",
                      background: "white",
                      cursor: page <= 1 ? "not-allowed" : "pointer",
                    }}
                    aria-label="Previous page"
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: "0.75rem", color: "#9b6e6e" }}>
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    style={{
                      minHeight: 36,
                      padding: "0.375rem 0.875rem",
                      border: "1px solid #e5d4cc",
                      borderRadius: "0.375rem",
                      fontSize: "0.875rem",
                      color: page >= totalPages ? "#d4b0b0" : "#3d2222",
                      background: "white",
                      cursor: page >= totalPages ? "not-allowed" : "pointer",
                    }}
                    aria-label="Next page"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar: Due Soon panel ──────────────────────────── */}
        <aside>
          <DueSoonPanel onViewAll={viewDueThisWeek} />

          {/* Quick summary card */}
          <div
            style={{
              marginTop: "1rem",
              background: "white",
              border: "1px solid #e5d4cc",
              borderRadius: "0.875rem",
              padding: "1.125rem",
              boxShadow: "0 2px 8px rgba(160,80,80,0.06)",
            }}
          >
            <div
              style={{
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: "#9b6e6e",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "0.875rem",
                borderLeft: "3px solid #b5343e",
                paddingLeft: "0.5rem",
              }}
            >
              Quick Filters
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {(
                [
                  { label: "Overdue", value: "overdue" as DueFilter, color: "#dc2626", bg: "#fef2f2" },
                  { label: "Due This Week", value: "due_this_week" as DueFilter, color: "#a16207", bg: "#fef9c3" },
                  { label: "Due This Month", value: "due_this_month" as DueFilter, color: "#0891b2", bg: "#ecfeff" },
                ] as const
              ).map(({ label, value, color, bg }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setDueFilter(value);
                    setPage(1);
                  }}
                  style={{
                    padding: "0.5rem 0.875rem",
                    border: `1px solid ${color}30`,
                    borderRadius: "0.375rem",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color,
                    background: dueFilter === value ? bg : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.1s",
                  }}
                >
                  {label}
                </button>
              ))}
              {dueFilter && (
                <button
                  type="button"
                  onClick={resetFilters}
                  style={{
                    padding: "0.5rem 0.875rem",
                    border: "1px solid #e5d4cc",
                    borderRadius: "0.375rem",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: "#7a5252",
                    background: "white",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  Show All Records
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {showAddModal && (
        <ImmunizationModal
          mode="add"
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            refetch();
          }}
        />
      )}

      {editTarget && (
        <ImmunizationModal
          mode="edit"
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            refetch();
            setEditTarget(null);
          }}
        />
      )}

    </div>
  );
}
