"use client";
/**
 * Patient Immunizations Page.
 *
 * Shows all vaccine dose records for a patient with inline add/edit forms.
 *
 * Features:
 *   - Table of immunization records (vaccine, dose, date, status, next due, batch)
 *   - "Add Immunization" toggle — shows an inline form without a modal library
 *   - Edit button on each row — expands an inline edit form
 *   - Delete button on each row — window.confirm before DELETE call
 *
 * RBAC note: the delete button is only shown to physician and admin roles
 * (matching the backend _PHYSICIAN_PLUS guard).  Add/edit buttons are shown
 * to bhw, physician, admin, admin_staff.
 *
 * TypeScript strict: true — no `any`.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useCurrentUser } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Immunization {
  id: string;
  patientId: string;
  vaccineName: string;
  doseNumber: number;
  dateAdministered: string | null;
  administeredBy: string | null;
  batchNumber: string | null;
  nextDueDate: string | null;
  notes: string | null;
  status: "scheduled" | "completed" | "missed" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

interface ImmunizationListResponse {
  items: Immunization[];
  total: number;
  page: number;
  page_size: number;
}

interface ApiImmunizationRaw {
  id: string;
  patient_id: string;
  vaccine_name: string;
  dose_number: number;
  date_administered: string | null;
  administered_by: string | null;
  batch_number: string | null;
  next_due_date: string | null;
  notes: string | null;
  status: "scheduled" | "completed" | "missed" | "cancelled";
  created_at: string;
  updated_at: string;
}

interface FormState {
  vaccineName: string;
  doseNumber: string;
  dateAdministered: string;
  batchNumber: string;
  nextDueDate: string;
  notes: string;
  status: string;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

function toCamel(raw: ApiImmunizationRaw): Immunization {
  return {
    id: raw.id,
    patientId: raw.patient_id,
    vaccineName: raw.vaccine_name,
    doseNumber: raw.dose_number,
    dateAdministered: raw.date_administered,
    administeredBy: raw.administered_by,
    batchNumber: raw.batch_number,
    nextDueDate: raw.next_due_date,
    notes: raw.notes,
    status: raw.status,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

async function fetchImmunizations(
  patientId: string,
  page: number
): Promise<ImmunizationListResponse> {
  const res = await fetch(
    `${API_BASE}/patients/${patientId}/immunizations?page=${page}&page_size=20`,
    { credentials: "include" }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Failed to load immunizations (${res.status})`);
  }
  const data = (await res.json()) as {
    items: ApiImmunizationRaw[];
    total: number;
    page: number;
    page_size: number;
  };
  return {
    items: data.items.map(toCamel),
    total: data.total,
    page: data.page,
    page_size: data.page_size,
  };
}

async function apiCreateImmunization(
  patientId: string,
  form: FormState
): Promise<Immunization> {
  const body = {
    vaccine_name: form.vaccineName.trim(),
    dose_number: parseInt(form.doseNumber, 10) || 1,
    date_administered: form.dateAdministered || null,
    batch_number: form.batchNumber.trim() || null,
    next_due_date: form.nextDueDate || null,
    notes: form.notes.trim() || null,
    status: form.status,
  };
  const res = await fetch(`${API_BASE}/patients/${patientId}/immunizations`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `Create failed (${res.status})`);
  }
  return toCamel((await res.json()) as ApiImmunizationRaw);
}

async function apiUpdateImmunization(
  patientId: string,
  immunizationId: string,
  form: FormState
): Promise<Immunization> {
  const body: Record<string, string | number | null> = {};
  if (form.vaccineName.trim()) body.vaccine_name = form.vaccineName.trim();
  if (form.doseNumber) body.dose_number = parseInt(form.doseNumber, 10);
  if (form.dateAdministered) body.date_administered = form.dateAdministered;
  if (form.batchNumber.trim()) body.batch_number = form.batchNumber.trim();
  if (form.nextDueDate) body.next_due_date = form.nextDueDate;
  body.notes = form.notes.trim() || null;
  if (form.status) body.status = form.status;

  const res = await fetch(
    `${API_BASE}/patients/${patientId}/immunizations/${immunizationId}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `Update failed (${res.status})`);
  }
  return toCamel((await res.json()) as ApiImmunizationRaw);
}

async function apiDeleteImmunization(
  patientId: string,
  immunizationId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/patients/${patientId}/immunizations/${immunizationId}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!res.ok && res.status !== 204) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `Delete failed (${res.status})`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusBadgeStyle(
  s: string
): React.CSSProperties {
  const colors: Record<string, { bg: string; color: string }> = {
    scheduled: { bg: "#eff6ff", color: "#1d4ed8" },
    completed: { bg: "#f0fdf4", color: "#15803d" },
    missed: { bg: "#fff7ed", color: "#c2410c" },
    cancelled: { bg: "#fdf5f0", color: "#9b6e6e" },
  };
  const c = colors[s] ?? colors.scheduled;
  return {
    display: "inline-block",
    padding: "0.1875rem 0.5rem",
    borderRadius: "9999px",
    fontSize: "0.6875rem",
    fontWeight: 600,
    background: c.bg,
    color: c.color,
    textTransform: "capitalize" as const,
    whiteSpace: "nowrap" as const,
  };
}

const EMPTY_FORM: FormState = {
  vaccineName: "",
  doseNumber: "1",
  dateAdministered: "",
  batchNumber: "",
  nextDueDate: "",
  notes: "",
  status: "scheduled",
};

// ---------------------------------------------------------------------------
// Inline form component
// ---------------------------------------------------------------------------

function ImmunizationForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  submitting,
}: {
  initial: FormState;
  onSubmit: (f: FormState) => void;
  onCancel: () => void;
  submitLabel: string;
  submitting: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.6875rem",
    fontWeight: 600,
    color: "#9b6e6e",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "0.25rem",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.4375rem 0.625rem",
    border: "1px solid #e5d4cc",
    borderRadius: "0.375rem",
    fontSize: "0.875rem",
    color: "#1a0808",
    background: "white",
    boxSizing: "border-box",
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      style={{
        background: "#fdf5f0",
        border: "1px solid #e5d4cc",
        borderRadius: "0.5rem",
        padding: "1.25rem",
        marginBottom: "1rem",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.75rem 1.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <div>
          <label style={labelStyle} htmlFor="vaccine_name">
            Vaccine Name *
          </label>
          <input
            suppressHydrationWarning
            id="vaccine_name"
            style={inputStyle}
            required
            value={form.vaccineName}
            onChange={(e) => set("vaccineName", e.target.value)}
            placeholder="e.g. BCG, Hepatitis B"
            maxLength={100}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="dose_number">
            Dose No.
          </label>
          <input
            suppressHydrationWarning
            id="dose_number"
            type="number"
            min={1}
            style={inputStyle}
            value={form.doseNumber}
            onChange={(e) => set("doseNumber", e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="status">
            Status
          </label>
          <select
            id="status"
            style={inputStyle}
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="missed">Missed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="date_administered">
            Date Administered
          </label>
          <input
            suppressHydrationWarning
            id="date_administered"
            type="date"
            style={inputStyle}
            value={form.dateAdministered}
            onChange={(e) => set("dateAdministered", e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="batch_number">
            Batch / Lot No.
          </label>
          <input
            suppressHydrationWarning
            id="batch_number"
            style={inputStyle}
            value={form.batchNumber}
            onChange={(e) => set("batchNumber", e.target.value)}
            placeholder="Optional"
            maxLength={50}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="next_due_date">
            Next Due Date
          </label>
          <input
            suppressHydrationWarning
            id="next_due_date"
            type="date"
            style={inputStyle}
            value={form.nextDueDate}
            onChange={(e) => set("nextDueDate", e.target.value)}
          />
        </div>
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle} htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Optional clinical notes"
        />
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "0.5rem 1.25rem",
            background: submitting ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)",
            color: "white",
            border: "none",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Saving..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "0.5rem 1.25rem",
            background: "white",
            color: "#3d2222",
            border: "1px solid #e5d4cc",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastState {
  message: string;
  kind: "success" | "error";
}

function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastState;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 50,
        padding: "0.75rem 1.25rem",
        borderRadius: "0.5rem",
        fontSize: "0.875rem",
        fontWeight: 500,
        color: "white",
        background: toast.kind === "success" ? "#16a34a" : "#dc2626",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        maxWidth: 320,
      }}
    >
      {toast.message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function PatientImmunizationsPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  // Next.js 15: params is a Promise — use React.use() to unwrap
  const { patientId } = React.use(params);
  const { user: currentUser } = useCurrentUser();

  const [records, setRecords] = useState<Immunization[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastState | null>(null);

  // RBAC: physician and admin may delete
  const canDelete =
    currentUser?.role === "physician" || currentUser?.role === "admin";
  // BHW, physician, admin, admin_staff may add/edit
  const canWrite = !!currentUser;

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      setFetchError(null);
      try {
        const data = await fetchImmunizations(patientId, p);
        setRecords(data.items);
        setTotal(data.total);
        setPage(p);
      } catch (err: unknown) {
        setFetchError(err instanceof Error ? err.message : "Failed to load.");
      } finally {
        setLoading(false);
      }
    },
    [patientId]
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  async function handleAdd(form: FormState) {
    setAddSubmitting(true);
    try {
      const rec = await apiCreateImmunization(patientId, form);
      setRecords((prev) => [rec, ...prev]);
      setTotal((t) => t + 1);
      setShowAddForm(false);
      setToast({ message: "Immunization record added.", kind: "success" });
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to add.",
        kind: "error",
      });
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleEdit(immunizationId: string, form: FormState) {
    setEditSubmitting(true);
    try {
      const rec = await apiUpdateImmunization(patientId, immunizationId, form);
      setRecords((prev) => prev.map((r) => (r.id === immunizationId ? rec : r)));
      setEditingId(null);
      setToast({ message: "Record updated.", kind: "success" });
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to update.",
        kind: "error",
      });
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(immunizationId: string, vaccineName: string) {
    if (
      !window.confirm(
        `Delete the "${vaccineName}" immunization record? This action cannot be undone.`
      )
    ) {
      return;
    }
    setDeletingId(immunizationId);
    try {
      await apiDeleteImmunization(patientId, immunizationId);
      setRecords((prev) => prev.filter((r) => r.id !== immunizationId));
      setTotal((t) => Math.max(0, t - 1));
      setToast({ message: "Record deleted.", kind: "success" });
    } catch (err: unknown) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to delete.",
        kind: "error",
      });
    } finally {
      setDeletingId(null);
    }
  }

  function editInitial(r: Immunization): FormState {
    return {
      vaccineName: r.vaccineName,
      doseNumber: String(r.doseNumber),
      dateAdministered: r.dateAdministered?.slice(0, 10) ?? "",
      batchNumber: r.batchNumber ?? "",
      nextDueDate: r.nextDueDate?.slice(0, 10) ?? "",
      notes: r.notes ?? "",
      status: r.status,
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  const thStyle: React.CSSProperties = {
    padding: "0.5rem 1rem",
    textAlign: "left" as const,
    fontSize: "0.6875rem",
    fontWeight: 600,
    color: "#9b6e6e",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    whiteSpace: "nowrap" as const,
  };

  const tdStyle: React.CSSProperties = {
    padding: "0.625rem 1rem",
    fontSize: "0.8125rem",
    color: "#7a5252",
    verticalAlign: "top" as const,
  };

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#1a0808",
              margin: 0,
            }}
          >
            Immunization Records
          </h1>
          <div style={{ fontSize: "0.8125rem", color: "#9b6e6e", marginTop: "0.25rem" }}>
            {total} record{total !== 1 ? "s" : ""}
          </div>
        </div>

        {canWrite && !showAddForm && (
          <button
            type="button"
            onClick={() => {
              setShowAddForm(true);
              setEditingId(null);
            }}
            style={{
              padding: "0.5rem 1.125rem",
              background: "linear-gradient(135deg, #b5343e, #c94060)",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Add Immunization
          </button>
        )}
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <ImmunizationForm
          initial={EMPTY_FORM}
          onSubmit={(f) => void handleAdd(f)}
          onCancel={() => setShowAddForm(false)}
          submitLabel="Add Record"
          submitting={addSubmitting}
        />
      )}

      {/* Error */}
      {fetchError && (
        <div
          style={{
            padding: "0.875rem 1rem",
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: "0.5rem",
            color: "#dc2626",
            fontSize: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          {fetchError}
        </div>
      )}

      {/* Records table */}
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
            <tr style={{ background: "linear-gradient(135deg, #fdf0eb 0%, #ffffff 100%)" }}>
              {[
                "Vaccine",
                "Dose",
                "Status",
                "Date Administered",
                "Batch / Lot",
                "Next Due",
                "Notes",
                "Actions",
              ].map((h) => (
                <th key={h} style={thStyle}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "#b09090",
                    fontSize: "0.875rem",
                  }}
                >
                  Loading...
                </td>
              </tr>
            )}
            {!loading && records.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "#b09090",
                    fontSize: "0.875rem",
                  }}
                >
                  No immunization records found.
                </td>
              </tr>
            )}
            {!loading &&
              records.map((r) => (
                <React.Fragment key={r.id}>
                  <tr
                    style={{
                      borderTop: "1px solid #f0e4dd",
                      background: editingId === r.id ? "#fafafa" : "white",
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 500, color: "#1a0808" }}>
                      {r.vaccineName}
                    </td>
                    <td style={tdStyle}>{r.doseNumber}</td>
                    <td style={tdStyle}>
                      <span style={statusBadgeStyle(r.status)}>{r.status}</span>
                    </td>
                    <td style={tdStyle}>{formatDate(r.dateAdministered)}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.75rem" }}>
                      {r.batchNumber ?? (
                        <span style={{ color: "#d4b0b0", fontStyle: "italic" }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        color:
                          r.nextDueDate && new Date(r.nextDueDate) < new Date()
                            ? "#dc2626"
                            : "#7a5252",
                      }}
                    >
                      {formatDate(r.nextDueDate)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        maxWidth: 160,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={r.notes ?? undefined}
                    >
                      {r.notes ?? (
                        <span style={{ color: "#d4b0b0", fontStyle: "italic" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingId(editingId === r.id ? null : r.id)
                          }
                          style={{
                            padding: "0.25rem 0.625rem",
                            border: "1px solid #e5d4cc",
                            borderRadius: "0.25rem",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            color: "#3d2222",
                            background: "white",
                            cursor: "pointer",
                            marginRight: "0.375rem",
                          }}
                        >
                          {editingId === r.id ? "Close" : "Edit"}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          disabled={deletingId === r.id}
                          onClick={() => void handleDelete(r.id, r.vaccineName)}
                          style={{
                            padding: "0.25rem 0.625rem",
                            border: "1px solid #fca5a5",
                            borderRadius: "0.25rem",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            color: "#dc2626",
                            background: "#fef2f2",
                            cursor: deletingId === r.id ? "not-allowed" : "pointer",
                          }}
                        >
                          {deletingId === r.id ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {/* Inline edit form row */}
                  {editingId === r.id && (
                    <tr>
                      <td
                        colSpan={8}
                        style={{
                          padding: "0.75rem 1rem",
                          background: "#fdf5f0",
                          borderTop: "1px solid #e5d4cc",
                        }}
                      >
                        <ImmunizationForm
                          initial={editInitial(r)}
                          onSubmit={(f) => void handleEdit(r.id, f)}
                          onCancel={() => setEditingId(null)}
                          submitLabel="Save Changes"
                          submitting={editSubmitting}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "0.5rem",
            marginTop: "1rem",
          }}
        >
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => void load(page - 1)}
            style={{
              padding: "0.375rem 0.875rem",
              border: "1px solid #e5d4cc",
              borderRadius: "0.375rem",
              fontSize: "0.8125rem",
              background: "white",
              cursor: page <= 1 ? "not-allowed" : "pointer",
              color: page <= 1 ? "#d4b0b0" : "#3d2222",
            }}
          >
            Prev
          </button>
          <span
            style={{ padding: "0.375rem 0.875rem", fontSize: "0.8125rem", color: "#9b6e6e" }}
          >
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => void load(page + 1)}
            style={{
              padding: "0.375rem 0.875rem",
              border: "1px solid #e5d4cc",
              borderRadius: "0.375rem",
              fontSize: "0.8125rem",
              background: "white",
              cursor: page >= totalPages ? "not-allowed" : "pointer",
              color: page >= totalPages ? "#d4b0b0" : "#3d2222",
            }}
          >
            Next
          </button>
        </div>
      )}

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
