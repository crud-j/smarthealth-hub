"use client";
/**
 * IdScanCard — Scan & Autofill entry point for Step 1 of the patient registration form.
 *
 * States:
 *   idle       — shows "Scan / Upload Government ID" button
 *   loading    — shows spinner while OCR is processing
 *   previewing — shows extracted fields table with confidence badges
 *   cleared    — reverts to idle
 *
 * On mobile, the hidden <input type="file" capture="environment"> delegates to
 * the OS camera app without requiring getUserMedia permission.
 *
 * Props:
 *   onAutofill(fields) — called when "Use these values" is clicked
 *   onClear()          — called when "Clear / Enter manually" is clicked
 */

import { useRef, useState } from "react";
import { useOcrExtract } from "@/hooks/useOcrExtract";
import type { OcrExtractResponse } from "@/hooks/useOcrExtract";

// ---------------------------------------------------------------------------
// Types for autofill
// ---------------------------------------------------------------------------

// Subset of PatientCreateFormValues that OCR can populate
export interface OcrAutofillFields {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  birthDate?: string;    // YYYY-MM-DD
  sex?: "male" | "female";
  address?: string;
  philhealthNo?: string;
  bloodType?: string;
}

interface IdScanCardProps {
  onAutofill: (fields: OcrAutofillFields, lowConfidenceFields: Set<string>) => void;
  onClear: () => void;
}

// ---------------------------------------------------------------------------
// Confidence badge component
// ---------------------------------------------------------------------------

function ConfidenceBadge({ confidence, notFound = false }: { confidence: number; notFound?: boolean }) {
  if (notFound) {
    return (
      <span
        style={{
          display: "inline-block",
          padding: "0.125rem 0.5rem",
          borderRadius: "9999px",
          fontSize: "0.625rem",
          fontWeight: 700,
          color: "#6b7280",
          background: "#f3f4f6",
          letterSpacing: "0.03em",
        }}
      >
        — 0%
      </span>
    );
  }
  const color = confidence >= 0.85 ? "#166534" : confidence >= 0.6 ? "#92400e" : "#991b1b";
  const bg = confidence >= 0.85 ? "#dcfce7" : confidence >= 0.6 ? "#fef3c7" : "#fee2e2";
  const label = confidence >= 0.85 ? "Good" : confidence >= 0.6 ? "Review" : "Low";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.125rem 0.5rem",
        borderRadius: "9999px",
        fontSize: "0.625rem",
        fontWeight: 700,
        color,
        background: bg,
        letterSpacing: "0.03em",
      }}
    >
      {label} {Math.round(confidence * 100)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function IdScanCard({ onAutofill, onClear }: IdScanCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { extract, loading, error, result, clearResult } = useOcrExtract();
  const [dismissed, setDismissed] = useState(false);

  const isIdle = !loading && result === null && !dismissed;
  const isPreviewing = !loading && result !== null && !dismissed;

  // Map OcrExtractResponse to OcrAutofillFields
  function buildAutofillFields(r: OcrExtractResponse): OcrAutofillFields {
    const fields: OcrAutofillFields = {};
    if (r.first_name.value) fields.firstName = r.first_name.value;
    if (r.middle_name.value) fields.middleName = r.middle_name.value;
    if (r.last_name.value) fields.lastName = r.last_name.value;
    if (r.birth_date.value) fields.birthDate = r.birth_date.value;
    if (r.sex.value && (r.sex.value === "male" || r.sex.value === "female")) {
      fields.sex = r.sex.value;
    }
    if (r.address_line.value) fields.address = r.address_line.value;
    if (r.philhealth_no.value) fields.philhealthNo = r.philhealth_no.value;
    if (r.blood_type.value) fields.bloodType = r.blood_type.value;
    return fields;
  }

  function buildLowConfidenceFields(r: OcrExtractResponse): Set<string> {
    const LOW_THRESHOLD = 0.75;
    const fieldMap: Record<string, number> = {
      firstName: r.first_name.confidence,
      middleName: r.middle_name.confidence,
      lastName: r.last_name.confidence,
      birthDate: r.birth_date.confidence,
      sex: r.sex.confidence,
      address: r.address_line.confidence,
      philhealthNo: r.philhealth_no.confidence,
      bloodType: r.blood_type.confidence,
    };
    const low = new Set<string>();
    for (const [fieldName, conf] of Object.entries(fieldMap)) {
      if (conf > 0 && conf < LOW_THRESHOLD) {
        low.add(fieldName);
      }
    }
    return low;
  }

  function handleUseValues() {
    if (!result) return;
    const fields = buildAutofillFields(result);
    const lowConf = buildLowConfidenceFields(result);
    onAutofill(fields, lowConf);
    setDismissed(true);
  }

  function handleClear() {
    clearResult();
    setDismissed(true);
    onClear();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected after clearing
    e.target.value = "";
    void extract(file);
    setDismissed(false);
  }

  function handleScanClick() {
    setDismissed(false);
    fileInputRef.current?.click();
  }

  const cardStyle: React.CSSProperties = {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: "0.75rem",
    padding: "1rem 1.25rem",
    marginBottom: "1rem",
  };

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.8125rem",
  };

  return (
    <div style={cardStyle}>
      {/* Hidden file input — capture="environment" uses OS camera on mobile */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleFileChange}
        aria-label="Select government ID image"
      />

      {/* Idle state — show scan button */}
      {isIdle && !loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#1e293b", marginBottom: "0.25rem" }}>
              Scan Government ID (optional)
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
              PhilID, PhilHealth card, UMID, driver&apos;s license, or passport
            </div>
          </div>
          <button
            type="button"
            onClick={handleScanClick}
            suppressHydrationWarning
            style={{
              padding: "0.5rem 1.25rem",
              background: "linear-gradient(135deg, #0f766e, #0d9488)",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              fontWeight: 700,
              fontSize: "0.875rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Scan / Upload ID
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "#475569", fontSize: "0.875rem" }}>
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block", fontSize: "1.25rem" }}>
            &#x27F3;
          </span>
          Reading ID... please wait
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={{ color: "#991b1b", fontSize: "0.8125rem", background: "#fee2e2", borderRadius: "0.375rem", padding: "0.5rem 0.75rem", marginBottom: "0.5rem" }}>
          {error}
          <button
            type="button"
            onClick={handleScanClick}
            style={{ marginLeft: "1rem", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontSize: "0.8125rem" }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Previewing state — extracted fields table */}
      {isPreviewing && result && (
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#166534", marginBottom: "0.75rem" }}>
            ID scanned — review extracted values before using them:
          </div>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                <th style={{ textAlign: "left", padding: "0.375rem 0.5rem", fontWeight: 600, color: "#475569", fontSize: "0.75rem" }}>Field</th>
                <th style={{ textAlign: "left", padding: "0.375rem 0.5rem", fontWeight: 600, color: "#475569", fontSize: "0.75rem" }}>Extracted Value</th>
                <th style={{ textAlign: "left", padding: "0.375rem 0.5rem", fontWeight: 600, color: "#475569", fontSize: "0.75rem" }}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Last Name", field: result.last_name },
                { label: "First Name", field: result.first_name },
                { label: "Middle Name", field: result.middle_name },
                { label: "Birth Date", field: result.birth_date },
                { label: "Sex", field: result.sex },
                { label: "Address", field: result.address_line },
                { label: "PhilHealth No.", field: result.philhealth_no },
                { label: "Blood Type", field: result.blood_type },
              ].map(({ label, field }) => (
                <tr key={label} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.375rem 0.5rem", color: "#374151", fontSize: "0.8125rem" }}>{label}</td>
                  <td style={{ padding: "0.375rem 0.5rem", color: field.value ? "#111827" : "#9ca3af", fontStyle: field.value ? "normal" : "italic", fontSize: "0.8125rem" }}>
                    {field.value ?? "not found"}
                  </td>
                  <td style={{ padding: "0.375rem 0.5rem" }}>
                    <ConfidenceBadge confidence={field.confidence} notFound={!field.value} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.625rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleUseValues}
              style={{
                padding: "0.5rem 1.25rem",
                background: "linear-gradient(135deg, #166534, #15803d)",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
                fontWeight: 700,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Use these values
            </button>
            <button
              type="button"
              onClick={handleClear}
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
              Clear / Enter manually
            </button>
          </div>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.7rem", color: "#6b7280" }}>
            Processed by: {result.provider}. Highlighted fields may need correction.
          </p>
        </div>
      )}

      {/* Dismissed / cleared — show re-scan option */}
      {dismissed && !loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.8125rem", color: "#6b7280" }}>
            {result ? "Values applied — edit fields as needed." : "Scanning cleared — enter details manually."}
          </span>
          <button
            type="button"
            onClick={() => {
              clearResult();
              setDismissed(false);
            }}
            style={{
              padding: "0.375rem 0.875rem",
              background: "white",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              fontWeight: 500,
              fontSize: "0.8125rem",
              cursor: "pointer",
            }}
          >
            Scan again
          </button>
        </div>
      )}
    </div>
  );
}
