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

  return (
    <div className="mb-4 rounded-xl border border-[#e5d4cc] bg-[#fdf7f3] p-4">
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
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="mb-0.5 text-sm font-bold text-[#1a0808]">Scan Government ID (optional)</p>
            <p className="text-xs text-[#9b6e6e]">PhilID, PhilHealth card, UMID, driver&apos;s license, or passport</p>
          </div>
          <button
            type="button"
            onClick={handleScanClick}
            suppressHydrationWarning
            className="rounded-lg px-4 py-2 text-sm font-bold text-white whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0d9488]"
            style={{ background: "linear-gradient(135deg, #0f766e, #0d9488)" }}
          >
            Scan / Upload ID
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-3 text-sm text-[#7a5252]">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          Reading ID... please wait
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="mb-2 rounded-lg border border-[#fca5a5] bg-[#fee2e2] px-3 py-2 text-sm text-[#991b1b]">
          {error}
          <button type="button" onClick={handleScanClick}
            className="ml-3 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#991b1b]">
            Try again
          </button>
        </div>
      )}

      {/* Previewing state — extracted fields table */}
      {isPreviewing && result && (
        <div>
          <p className="mb-3 text-sm font-bold text-emerald-700">ID scanned — review extracted values before using them:</p>
          <div className="overflow-x-auto rounded-lg border border-[#e5d4cc]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#fdf7f3]">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#9b6e6e]">Field</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#9b6e6e]">Extracted Value</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-[#9b6e6e]">Confidence</th>
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
                  <tr key={label} className="border-t border-[#f0e4dd]">
                    <td className="px-3 py-2 text-[#3d2222]">{label}</td>
                    <td className={`px-3 py-2 ${field.value ? "text-[#1a0808]" : "italic text-[#9b6e6e]"}`}>
                      {field.value ?? "not found"}
                    </td>
                    <td className="px-3 py-2">
                      <ConfidenceBadge confidence={field.confidence} notFound={!field.value} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={handleUseValues}
              className="rounded-lg px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
              style={{ background: "linear-gradient(135deg, #166534, #15803d)" }}>
              Use these values
            </button>
            <button type="button" onClick={handleClear}
              className="rounded-lg border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#374151] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
              Clear / Enter manually
            </button>
          </div>
          <p className="mt-2 text-xs text-[#9b6e6e]">
            Processed by: {result.provider}. Highlighted fields may need correction.
          </p>
        </div>
      )}

      {/* Dismissed / cleared — show re-scan option */}
      {dismissed && !loading && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-[#7a5252]">
            {result ? "Values applied — edit fields as needed." : "Scanning cleared — enter details manually."}
          </span>
          <button type="button" onClick={() => { clearResult(); setDismissed(false); }}
            className="rounded-lg border border-[#d1d5db] bg-white px-3 py-1.5 text-sm font-medium text-[#374151] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
            Scan again
          </button>
        </div>
      )}
    </div>
  );
}
