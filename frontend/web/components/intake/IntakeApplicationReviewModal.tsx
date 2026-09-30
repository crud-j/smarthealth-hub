"use client";
/**
 * IntakeApplicationReviewModal
 *
 * Shared modal for reviewing a public online intake application.
 * Used by:
 *   - /settings/intake-applications  (admin review queue)
 *   - /registrations                  (unified pending registrations inbox)
 *
 * Fetches full detail internally, manages approve/reject sub-views,
 * rejection-reason validation, and loading / error states.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import Swal from "sweetalert2";
import { apiFetch, ApiError } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Exported types — callers should import IntakeApplication from here so the
// shape is defined in exactly one place.
// ---------------------------------------------------------------------------

export interface IntakeApplicationSummary {
  id: string;
  reference_number: string;
  status: "pending" | "approved" | "rejected";
  first_name: string;
  last_name: string;
  birth_date: string;
  sex: string;
  mobile_number: string | null;
  barangay: string;
  municipality: string;
  created_at: string;
  reviewed_at: string | null;
  patient_id: string | null;
}

/** Full detail shape returned by GET /intake-applications/{id} */
export interface IntakeApplication extends IntakeApplicationSummary {
  middle_name: string | null;
  suffix: string | null;
  civil_status: string | null;
  philhealth_id: string | null;
  pwd_id: string | null;
  blood_type: string | null;
  email: string | null;
  house_street: string | null;
  province: string | null;
  region: string | null;
  zip_code: string | null;
  emergency_contact_name: string;
  emergency_contact_relationship: string | null;
  emergency_contact_number: string;
  known_allergies: string | null;
  current_medications: string | null;
  pre_existing_conditions: string | null;
  data_privacy_consent: boolean;
  rejection_reason: string | null;
  reviewed_by_id: string | null;
  submitted_ip: string | null;
}

/** Shape returned by POST /intake-applications/{id}/approve */
export interface IntakeApproveResult {
  patient_id: string;
  patient_code: string;
  reference_number: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IntakeApplicationReviewModalProps {
  /** UUID of the application to load and review. */
  applicationId: string;
  /** Called when the modal should close without any action taken. */
  onClose: () => void;
  /**
   * Called after a successful approval.
   * Receives the created patient_id and patient_code so the parent can
   * navigate to the patient record or refresh its list.
   */
  onApproved: (patientId: string, patientCode: string) => void;
  /**
   * Called after a successful rejection so the parent can refresh its list.
   */
  onRejected: () => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending:  { bg: "bg-amber-100",  text: "text-amber-800",  label: "Pending" },
    approved: { bg: "bg-green-100",  text: "text-green-800",  label: "Approved" },
    rejected: { bg: "bg-red-100",    text: "text-red-800",    label: "Rejected" },
  };
  const c = config[status] ?? { bg: "bg-slate-100", text: "text-slate-700", label: status };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-[#b09090]">
        {label}
      </p>
      <p className="text-sm text-[#1a0808]">
        {value ?? <span className="italic text-[#d4b0b0]">—</span>}
      </p>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-2 mb-3 border-b border-[#f0e4dd] pb-2 mt-4 first:mt-0">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#b5343e]">
        {children}
      </h3>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IntakeApplicationReviewModal({
  applicationId,
  onClose,
  onApproved,
  onRejected,
}: IntakeApplicationReviewModalProps) {
  const [detail, setDetail] = useState<IntakeApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action states
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  // Load full detail on mount
  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<IntakeApplication>(
          `/intake-applications/${applicationId}`
        );
        setDetail(data);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Failed to load application."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [applicationId]);

  // ------------------------------------------------------------------
  // Approve
  // ------------------------------------------------------------------
  async function handleApprove() {
    const confirmed = await Swal.fire({
      icon: "question",
      title: "Approve Application?",
      text: "This will create a permanent patient record from this registration.",
      showCancelButton: true,
      confirmButtonText: "Yes, Approve",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#16a34a",
      cancelButtonColor: "#6b7280",
    });
    if (!confirmed.isConfirmed) return;

    setApproving(true);
    try {
      const result = await apiFetch<IntakeApproveResult>(
        `/intake-applications/${applicationId}/approve`,
        {
          method: "POST",
          body: JSON.stringify({ registration_source: "walk_in" }),
        }
      );
      await Swal.fire({
        icon: "success",
        title: "Patient Record Created",
        html: `Patient code <strong>${result.patient_code}</strong> has been created successfully.`,
        confirmButtonColor: "#16a34a",
      });
      onApproved(result.patient_id, result.patient_code);
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Approval Failed",
        text:
          err instanceof ApiError ? err.message : "Approval failed.",
        confirmButtonColor: "#b5343e",
      });
    } finally {
      setApproving(false);
    }
  }

  // ------------------------------------------------------------------
  // Reject
  // ------------------------------------------------------------------
  async function handleReject() {
    if (rejectionReason.trim().length < 5) {
      setError("Rejection reason must be at least 5 characters.");
      return;
    }

    const confirmed = await Swal.fire({
      icon: "warning",
      title: "Reject Application?",
      text: "The applicant will not be notified automatically. Are you sure?",
      showCancelButton: true,
      confirmButtonText: "Yes, Reject",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
    });
    if (!confirmed.isConfirmed) return;

    setRejecting(true);
    try {
      await apiFetch(`/intake-applications/${applicationId}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      });
      await Swal.fire({
        icon: "success",
        title: "Application Rejected",
        text: "The application has been marked as rejected.",
        confirmButtonColor: "#b5343e",
      });
      onRejected();
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Rejection Failed",
        text: err instanceof ApiError ? err.message : "Rejection failed.",
        confirmButtonColor: "#b5343e",
      });
    } finally {
      setRejecting(false);
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        style={{ border: "1px solid #e5d4cc" }}
      >
        {/* Sticky header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4"
          style={{ borderColor: "#edd9d0" }}
        >
          <div>
            <h2 className="text-base font-bold text-[#1a0808]">
              Application Review
            </h2>
            {detail && (
              <p className="mt-0.5 font-mono text-xs text-[#9b6e6e]">
                {detail.reference_number}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#7a5252] hover:bg-[#fdf5f0] hover:text-[#1a0808] transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Loading state */}
          {loading && (
            <p className="text-sm text-[#7a5252]">Loading…</p>
          )}

          {/* Inline error banner (for validation errors, not API call errors which use Swal) */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {detail && (
            <>
              {/* Status + submitted time */}
              <div className="mb-4 flex items-center gap-2">
                <StatusBadge status={detail.status} />
                <span className="text-xs text-[#7a5252]">
                  Submitted{" "}
                  {new Date(detail.created_at).toLocaleString("en-PH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>

              {/* Detail grid */}
              <div className="grid grid-cols-2 gap-x-6">
                {/* Personal Information */}
                <SectionHeading>Personal Information</SectionHeading>
                <DetailRow label="First Name" value={detail.first_name} />
                <DetailRow label="Middle Name" value={detail.middle_name} />
                <DetailRow label="Last Name" value={detail.last_name} />
                <DetailRow label="Suffix" value={detail.suffix} />
                <DetailRow label="Date of Birth" value={detail.birth_date} />
                <DetailRow label="Sex" value={detail.sex} />
                <DetailRow label="Civil Status" value={detail.civil_status} />
                <DetailRow label="Blood Type" value={detail.blood_type} />
                <DetailRow label="PhilHealth ID" value={detail.philhealth_id} />
                <DetailRow label="PWD ID" value={detail.pwd_id} />

                {/* Contact & Address */}
                <SectionHeading>Contact &amp; Address</SectionHeading>
                <DetailRow label="Mobile" value={detail.mobile_number} />
                <DetailRow label="Email" value={detail.email} />
                <DetailRow label="House / Street" value={detail.house_street} />
                <DetailRow label="Barangay" value={detail.barangay} />
                <DetailRow label="Municipality" value={detail.municipality} />
                <DetailRow label="Province" value={detail.province} />
                <DetailRow label="Region" value={detail.region} />
                <DetailRow label="ZIP Code" value={detail.zip_code} />

                {/* Emergency Contact */}
                <SectionHeading>Emergency Contact</SectionHeading>
                <DetailRow label="Name" value={detail.emergency_contact_name} />
                <DetailRow
                  label="Relationship"
                  value={detail.emergency_contact_relationship}
                />
                <DetailRow
                  label="Contact Number"
                  value={detail.emergency_contact_number}
                />

                {/* Medical Background */}
                <SectionHeading>Medical Background</SectionHeading>
                <div className="col-span-2">
                  <DetailRow
                    label="Known Allergies"
                    value={detail.known_allergies}
                  />
                </div>
                <div className="col-span-2">
                  <DetailRow
                    label="Current Medications"
                    value={detail.current_medications}
                  />
                </div>
                <div className="col-span-2">
                  <DetailRow
                    label="Pre-existing Conditions"
                    value={detail.pre_existing_conditions}
                  />
                </div>

                {/* Rejection Reason (shown when already rejected) */}
                {detail.rejection_reason && (
                  <>
                    <div className="col-span-2 mb-3 border-b border-red-200 pb-2 mt-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-red-600">
                        Rejection Reason
                      </h3>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-red-700">
                        {detail.rejection_reason}
                      </p>
                    </div>
                  </>
                )}

                {/* Link to created patient record (shown when approved) */}
                {detail.patient_id && (
                  <div className="col-span-2 mt-4">
                    <Link
                      href={`/patients/${detail.patient_id}`}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#b5343e] hover:underline"
                    >
                      View Created Patient Record{" "}
                      <ExternalLink size={13} />
                    </Link>
                  </div>
                )}
              </div>

              {/* Action area — only shown for pending applications */}
              {detail.status === "pending" && (
                <div
                  className="mt-6 border-t pt-4 space-y-3"
                  style={{ borderColor: "#f0e4dd" }}
                >
                  {showRejectForm ? (
                    /* Rejection reason form */
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#3d2222]">
                        Rejection Reason *
                      </label>
                      <textarea
                        rows={3}
                        value={rejectionReason}
                        onChange={(e) => {
                          setRejectionReason(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Enter the reason for rejecting this application…"
                        className="w-full rounded-lg border border-[#e5d4cc] px-3 py-2 text-sm text-[#1a0808] focus:outline-none focus:ring-2 focus:ring-[#b5343e] placeholder:text-[#b09090]"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleReject()}
                          disabled={rejecting}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                        >
                          {rejecting ? "Rejecting…" : "Confirm Rejection"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowRejectForm(false);
                            setRejectionReason("");
                            setError(null);
                          }}
                          className="rounded-lg border border-[#e5d4cc] px-4 py-2 text-sm font-semibold text-[#3d2222] hover:bg-[#fdf5f0] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Primary action buttons */
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleApprove()}
                        disabled={approving}
                        className="rounded-lg bg-green-700 px-5 py-2 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-60 transition-colors"
                      >
                        {approving ? "Approving…" : "Approve & Create Patient"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRejectForm(true)}
                        className="rounded-lg border border-red-300 px-5 py-2 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
