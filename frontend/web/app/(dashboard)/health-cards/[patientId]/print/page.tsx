"use client";

/**
 * /health-cards/[patientId]/print — Card preview and PDF download page.
 *
 * - Fetches patient profile + card metadata from the API.
 * - Renders HealthCardPreview for a visual preview before downloading.
 * - "Download PDF" triggers GET /health-cards/{id}/pdf (streamed file download).
 * - "Print" opens browser print dialog.
 * - 404 (no card generated yet): shows "Generate Card" CTA.
 *
 * This is a client component so it can use hooks for data fetching and the
 * PDF download (which requires window.location for blob download in the
 * browser).
 */

import { useCallback, useEffect, useState } from "react";
import { use } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import HealthCardPreview from "@/components/cards/HealthCardPreview";
import type { HealthCardData } from "@/types/healthCard";
import type { Patient } from "@/types/patient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageState =
  | { phase: "loading" }
  | { phase: "no_card" }
  | { phase: "ready"; patient: Patient; card: HealthCardData }
  | { phase: "error"; message: string };

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HealthCardPrintPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = use(params);

  const [pageState, setPageState] = useState<PageState>({ phase: "loading" });
  const [downloadInProgress, setDownloadInProgress] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch data on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch patient and card in parallel.
        const [patient, card] = await Promise.all([
          apiFetch<Patient>(`/patients/${patientId}`),
          apiFetch<HealthCardData>(`/health-cards/${patientId}`),
        ]);
        setPageState({ phase: "ready", patient, card });
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            // Could be patient 404 or card 404 — check which.
            // If patient exists but card doesn't, show "Generate Card" CTA.
            try {
              const patient = await apiFetch<Patient>(`/patients/${patientId}`);
              // Patient found but no card.
              setPageState({ phase: "no_card" });
              // Store patient in a local scope workaround — we stash it via a
              // second state update to keep the no_card state clean.
              void patient; // patient is loaded but we stay in no_card phase
            } catch {
              setPageState({
                phase: "error",
                message: "Patient not found. Please verify the patient ID.",
              });
            }
          } else {
            setPageState({
              phase: "error",
              message: "Failed to load card data. Please try again.",
            });
          }
        } else {
          setPageState({
            phase: "error",
            message: "An unexpected error occurred.",
          });
        }
      }
    }

    void loadData();
  }, [patientId]);

  // ---------------------------------------------------------------------------
  // PDF download
  // ---------------------------------------------------------------------------

  const handleDownloadPdf = useCallback(async () => {
    if (pageState.phase !== "ready") return;
    setDownloadInProgress(true);

    try {
      // Use fetch directly for binary response (apiFetch parses JSON).
      const response = await fetch(
        `${API_BASE}/health-cards/${patientId}/pdf`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error(`PDF generation failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Trigger download.
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `health_card_${pageState.card.card_number}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download PDF. Please try again.");
    } finally {
      setDownloadInProgress(false);
    }
  }, [pageState, patientId]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (pageState.phase === "loading") {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#0d9488" }}>
        <p>Loading health card...</p>
      </div>
    );
  }

  if (pageState.phase === "error") {
    return (
      <div
        role="alert"
        style={{
          maxWidth: "480px",
          margin: "40px auto",
          padding: "24px",
          borderRadius: "12px",
          border: "2px solid #dc2626",
          backgroundColor: "#fef2f2",
        }}
      >
        <h2 style={{ margin: "0 0 8px", color: "#dc2626" }}>Error</h2>
        <p style={{ margin: 0, color: "#374151" }}>{pageState.message}</p>
      </div>
    );
  }

  if (pageState.phase === "no_card") {
    return (
      <div
        style={{
          maxWidth: "480px",
          margin: "40px auto",
          padding: "24px",
          borderRadius: "12px",
          border: "2px solid #fde047",
          backgroundColor: "#fef9c3",
          textAlign: "center",
        }}
      >
        <h2 style={{ margin: "0 0 8px", color: "#713f12" }}>No Card Generated</h2>
        <p style={{ margin: "0 0 20px", color: "#374151" }}>
          This patient does not have a health card yet. Generate one first.
        </p>
        <a
          href={`/health-cards/${patientId}`}
          style={{
            display: "inline-block",
            padding: "10px 24px",
            borderRadius: "8px",
            backgroundColor: "#0d9488",
            color: "#ffffff",
            textDecoration: "none",
            fontWeight: "bold",
            fontSize: "14px",
          }}
        >
          Generate Health Card
        </a>
      </div>
    );
  }

  const { patient, card } = pageState;

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "24px 16px" }}>
      {/* Page header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 4px", fontSize: "22px", color: "#0f172a" }}>
          Health Card
        </h1>
        <p style={{ margin: 0, fontSize: "14px", color: "#64748b" }}>
          {patient.lastName}, {patient.firstName} &middot;{" "}
          {patient.patientCode}
        </p>
      </div>

      {/* Card status badge */}
      {card.status !== "active" && (
        <div
          role="alert"
          style={{
            padding: "10px 16px",
            borderRadius: "8px",
            backgroundColor: "#fef9c3",
            border: "1px solid #fde047",
            color: "#713f12",
            marginBottom: "16px",
            fontSize: "14px",
          }}
        >
          This card is <strong>{card.status}</strong>. Please reissue a new card.
        </div>
      )}

      {/* Card preview */}
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "center" }}>
        <HealthCardPreview patient={patient} card={card} />
      </div>

      {/* Card metadata */}
      <div
        style={{
          backgroundColor: "#f8fafc",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
          fontSize: "13px",
          color: "#374151",
        }}
      >
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px 16px",
            margin: 0,
          }}
        >
          {[
            ["Card Number", card.card_number],
            ["Version", `v${card.card_version}`],
            [
              "Issued",
              new Date(card.issued_at).toLocaleDateString("en-PH"),
            ],
            ["NFC Linked", card.nfc_uid ? "Yes" : "Not yet"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase" }}>
                {label}
              </dt>
              <dd style={{ margin: "2px 0 0", fontWeight: "bold" }}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => void handleDownloadPdf()}
          disabled={downloadInProgress}
          style={{
            flex: 1,
            padding: "12px 20px",
            borderRadius: "8px",
            backgroundColor: "#0d9488",
            color: "#ffffff",
            border: "none",
            fontSize: "14px",
            fontWeight: "bold",
            cursor: downloadInProgress ? "not-allowed" : "pointer",
            opacity: downloadInProgress ? 0.7 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            minWidth: "160px",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          {downloadInProgress ? "Generating PDF..." : "Download PDF"}
        </button>

        <button
          type="button"
          onClick={handlePrint}
          style={{
            flex: 1,
            padding: "12px 20px",
            borderRadius: "8px",
            backgroundColor: "transparent",
            color: "#0d9488",
            border: "2px solid #0d9488",
            fontSize: "14px",
            fontWeight: "bold",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            minWidth: "120px",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect width="12" height="8" x="6" y="14" />
          </svg>
          Print
        </button>
      </div>

      <p
        style={{
          marginTop: "16px",
          fontSize: "12px",
          color: "#94a3b8",
          textAlign: "center",
        }}
      >
        The PDF will be printed at CR80 card size (85.6mm × 54mm).
        Use a dedicated card printer for best results.
      </p>
    </div>
  );
}
