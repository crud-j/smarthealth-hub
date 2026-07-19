"use client";
/**
 * Patient Profile Page.
 *
 * Shows:
 *   - Demographics card: all RHU header fields (name, age, sex, birthday,
 *     PhilHealth, contact, address)
 *   - Visit history table (case_no, date, visit type, chief complaint)
 *   - Priority flags (Senior, PWD, Pregnant)
 *   - Action buttons: Edit | Print Card | Verify
 *
 * PHI note: diagnosis and treatment_notes are NOT shown on this page.
 * The visit table shows only VisitSummary (no encrypted PHI) — clinical staff
 * must navigate to /visits/{id} for the full record.
 *
 * This page is a Client Component because it uses data hooks (usePatient,
 * usePatientVisits) which need the auth cookie from the browser.
 */

import Link from "next/link";
import { usePatient, usePatientVisits } from "@/hooks/usePatients";
import type { VisitSummary } from "@/types/patient";
import React, { useState } from "react";
import ProfilePhotoUploader from "@/app/(dashboard)/patients/_components/ProfilePhotoUploader";

// ---------------------------------------------------------------------------
// Helper: format date strings
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Flag badge
// ---------------------------------------------------------------------------

function FlagBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.25rem 0.75rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: color,
        color: "white",
        marginRight: "0.5rem",
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Demographics card field
// ---------------------------------------------------------------------------

function DemoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.875rem" }}>
      <div
        style={{
          fontSize: "0.625rem",
          fontWeight: 700,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: "0.075em",
          marginBottom: "0.125rem",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "0.875rem", color: "#0f172a", fontWeight: 500 }}>
        {value || <span style={{ color: "#cbd5e1", fontStyle: "italic" }}>—</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visit table row
// ---------------------------------------------------------------------------

function VisitRow({ visit }: { visit: VisitSummary }) {
  return (
    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
      <td
        style={{
          padding: "0.625rem 1rem",
          fontSize: "0.8125rem",
          fontFamily: "monospace",
          color: "#0f172a",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        {visit.caseNo ?? "—"}
      </td>
      <td
        style={{
          padding: "0.625rem 1rem",
          fontSize: "0.8125rem",
          color: "#475569",
          whiteSpace: "nowrap",
        }}
      >
        {formatDateTime(visit.visitDate)}
      </td>
      <td style={{ padding: "0.625rem 1rem", fontSize: "0.8125rem", color: "#475569" }}>
        {visit.visitType.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
      </td>
      <td
        style={{
          padding: "0.625rem 1rem",
          fontSize: "0.8125rem",
          color: "#475569",
          maxWidth: 240,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={visit.chiefComplaint ?? undefined}
      >
        {visit.chiefComplaint ?? (
          <span style={{ color: "#cbd5e1", fontStyle: "italic" }}>—</span>
        )}
      </td>
      <td style={{ padding: "0.625rem 1rem", fontSize: "0.8125rem", color: "#475569" }}>
        {visit.bloodPressure ?? "—"}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PatientProfilePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  // Next.js 15: params is a Promise — use React.use() to unwrap
  const { patientId } = React.use(params);
  const { data: patient, loading, error } = usePatient(patientId);
  const {
    data: visits,
    loading: visitsLoading,
    error: visitsError,
  } = usePatientVisits(patientId);

  // Track the current patient photo URL so the profile header updates after upload.
  const apiBase =
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace("/api/v1", "") ??
    "http://localhost:8000";

  // Derive initial photo URL from the loaded patient record's photo_path.
  // Once set by the patient data hook, we override it with a cache-busted
  // URL whenever the uploader saves a new photo.
  const initialPhotoUrl = patient?.photoPath
    ? `${apiBase}${patient.photoPath}`
    : null;

  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);

  // Build the photo URL once the patient data is available.
  // We point directly at the authenticated photo endpoint rather than the
  // static /media path so auth cookies are always sent.
  const photoEndpointUrl = patientId
    ? `${apiBase}/api/v1/patients/${patientId}/photo`
    : null;

  if (loading) {
    return (
      <div
        style={{
          padding: "3rem",
          textAlign: "center",
          color: "#94a3b8",
          fontSize: "0.875rem",
        }}
      >
        Loading patient profile...
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div
        style={{
          padding: "1.5rem",
          background: "#fef2f2",
          border: "1px solid #fca5a5",
          borderRadius: "0.5rem",
          color: "#dc2626",
          fontSize: "0.875rem",
        }}
      >
        {error?.message ?? "Patient not found."}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Page header + actions */}
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
          <div
            style={{
              fontSize: "0.75rem",
              color: "#64748b",
              marginBottom: "0.25rem",
              fontFamily: "monospace",
            }}
          >
            {patient.patientCode}
          </div>
          <h1
            style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 }}
          >
            {patient.fullName}
          </h1>
          <div style={{ marginTop: "0.5rem" }}>
            {patient.isSenior && <FlagBadge label="Senior Citizen" color="#8b5cf6" />}
            {patient.isPwd && <FlagBadge label="PWD" color="#0891b2" />}
            {patient.isPregnant && <FlagBadge label="Pregnant" color="#db2777" />}
            {!patient.isActive && (
              <FlagBadge label="Inactive" color="#94a3b8" />
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link
            href={`/patients/${patientId}/edit`}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #e2e8f0",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#374151",
              textDecoration: "none",
              background: "white",
            }}
          >
            Edit
          </Link>
          <Link
            href={`/health-cards/${patientId}/print`}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #e2e8f0",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#374151",
              textDecoration: "none",
              background: "white",
            }}
          >
            Print Card
          </Link>
          <Link
            href={`/patients/${patientId}/verify`}
            style={{
              padding: "0.5rem 1rem",
              background: "#14b8a6",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "white",
              textDecoration: "none",
            }}
          >
            Verify
          </Link>
        </div>
      </div>

      {/* Demographics card */}
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: "0.5rem",
          padding: "1.5rem",
          marginBottom: "1.25rem",
        }}
      >
        <div
          style={{
            fontSize: "0.875rem",
            fontWeight: 700,
            color: "#0f172a",
            marginBottom: "1.25rem",
            paddingBottom: "0.5rem",
            borderBottom: "1px solid #f1f5f9",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Patient Demographics
        </div>

        {/* Patient header: photo + name row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          {/* Profile photo thumbnail */}
          <div style={{ flexShrink: 0 }}>
            <img
              src={currentPhotoUrl ?? initialPhotoUrl ?? photoEndpointUrl ?? undefined}
              alt="Patient profile photo"
              width={80}
              height={80}
              onError={(e) => {
                // If the photo endpoint returns 404 (no photo), hide the img
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
              style={{
                width: 80,
                height: 80,
                objectFit: "cover",
                borderRadius: "0.5rem",
                border: "1px solid #e2e8f0",
                background: "#f1f5f9",
                display: "block",
              }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "0 2rem",
              }}
            >
              <DemoField label="Registration Date" value={formatDate(patient.createdAt)} />
              <DemoField
                label="Birthday"
                value={`${formatDate(patient.birthDate)} (Age ${patient.age})`}
              />
              <DemoField
                label="Sex"
                value={patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1)}
              />
              <DemoField label="Civil Status" value={patient.civilStatus} />
              <DemoField label="Contact No." value={patient.mobileNumber} />
              <DemoField
                label="PhilHealth"
                value={
                  patient.philhealthNo
                    ? `${patient.philhealthNo}${patient.philhealthMemberType ? ` (${patient.philhealthMemberType})` : ""}`
                    : undefined
                }
              />
              <DemoField
                label="Complete Address"
                value={patient.address}
              />
              {(patient.guardianName || patient.guardianContact) && (
                <DemoField
                  label="Guardian"
                  value={
                    `${patient.guardianName ?? ""}${patient.guardianContact ? ` — ${patient.guardianContact}` : ""}`.trim()
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Profile photo uploader */}
      <ProfilePhotoUploader
        patientId={patientId}
        currentPhotoUrl={null}
        onPhotoSaved={(url) => {
          // Force a cache-bust by appending a timestamp so the browser
          // re-fetches the newly saved photo from the API endpoint.
          const base =
            (process.env.NEXT_PUBLIC_API_BASE_URL?.replace("/api/v1", "") ??
              "http://localhost:8000") + url;
          setCurrentPhotoUrl(`${base}?t=${Date.now()}`);
        }}
      />

      {/* Visit history */}
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: "0.5rem",
          overflow: "hidden",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.5rem",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <div
            style={{
              fontSize: "0.875rem",
              fontWeight: 700,
              color: "#0f172a",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Visit History
          </div>
          <Link
            href={`/patients/${patientId}/visits/new`}
            style={{
              padding: "0.375rem 0.875rem",
              background: "#0f172a",
              color: "white",
              borderRadius: "0.375rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            + Add Visit
          </Link>
        </div>

        {visitsError && (
          <div
            style={{
              padding: "1rem 1.5rem",
              color: "#dc2626",
              fontSize: "0.875rem",
            }}
          >
            {visitsError.message}
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {[
                "Case No.",
                "Date / Time",
                "Visit Type",
                "Chief Complaint",
                "BP",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "0.5rem 1rem",
                    textAlign: "left",
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "#64748b",
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
            {visitsLoading && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "#94a3b8",
                    fontSize: "0.875rem",
                  }}
                >
                  Loading visits...
                </td>
              </tr>
            )}
            {!visitsLoading && visits.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "#94a3b8",
                    fontSize: "0.875rem",
                  }}
                >
                  No visits recorded yet.
                </td>
              </tr>
            )}
            {!visitsLoading &&
              visits.map((v) => <VisitRow key={v.id} visit={v} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
