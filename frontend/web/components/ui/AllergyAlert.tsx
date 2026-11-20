"use client";

import Link from "next/link";
import { usePatient } from "@/hooks/usePatients";

/**
 * Allergy banner shown wherever staff act on a patient (profile, Log Visit,
 * immunizations), so allergies are seen before giving medicine or a vaccine.
 *
 * Wording rules (patient safety):
 * - Empty allergies → "No allergies on record", never "No known allergies":
 *   the system cannot tell "patient said none" from "nobody asked".
 * - While loading, show nothing that sounds reassuring.
 *
 * Visible to every staff role (allergies are not clinical-note PHI; Phase 10
 * decision 1). The value comes from GET /patients/{id}, already decrypted.
 */

type AllergyAlertProps = {
  status: "loading" | "error" | "ready";
  allergies?: string | null;
  /** Link to the patient edit page ("Edit" / "Record allergies"). */
  editHref?: string;
};

export function AllergyAlert({ status, allergies, editHref }: AllergyAlertProps) {
  if (status === "loading") {
    return (
      <div
        aria-hidden="true"
        className="mb-4 h-11 animate-pulse rounded-xl border border-[#edd9d0] bg-[#fdf5f0]"
      />
    );
  }

  if (status === "error") {
    return (
      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
        Allergies could not be loaded. Check the patient record before giving medicine or vaccines.
      </div>
    );
  }

  const text = allergies?.trim();

  if (text) {
    return (
      <div
        role="alert"
        className="mb-4 flex flex-wrap items-start justify-between gap-2 rounded-xl border border-[#fca5a5] border-l-4 border-l-[#dc2626] bg-[#fef2f2] px-4 py-3"
      >
        <p className="text-sm text-[#7f1d1d]">
          <span className="mr-2 text-xs font-bold uppercase tracking-wider text-[#b91c1c]">
            <span aria-hidden="true">⚠ </span>Allergies
          </span>
          <strong className="font-bold">{text}</strong>
        </p>
        {editHref && (
          <Link
            href={editHref}
            className="text-xs font-semibold text-[#b91c1c] underline hover:text-[#7f1d1d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
          >
            Edit
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5d4cc] bg-[#fdf5f0] px-4 py-2.5 text-sm text-[#7a5252]">
      <span>
        <strong className="font-semibold text-[#3d2222]">No allergies on record.</strong> Ask the
        patient before giving medicine or vaccines.
      </span>
      {editHref && (
        <Link
          href={editHref}
          className="text-xs font-semibold text-[#b5343e] underline hover:text-[#7f1d1d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
        >
          Record allergies
        </Link>
      )}
    </div>
  );
}

/**
 * Loads the patient by id and shows their allergy banner. For pages that do
 * not already load the patient (immunization records, the add-immunization
 * dialog after a patient is picked).
 */
export function PatientAllergyAlert({
  patientId,
  showEditLink = true,
}: {
  patientId: string;
  showEditLink?: boolean;
}) {
  const { data: patient, error } = usePatient(patientId);

  if (error) return <AllergyAlert status="error" />;
  // usePatient reports "not loading" before its first fetch, and keeps the
  // previous patient's data while a new id loads: only trust data for THIS id.
  if (!patient || patient.id !== patientId) return <AllergyAlert status="loading" />;

  return (
    <AllergyAlert
      status="ready"
      allergies={patient.allergies}
      editHref={showEditLink ? `/patients/${patientId}/edit` : undefined}
    />
  );
}
