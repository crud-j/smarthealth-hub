"use client";

/**
 * /health-cards/[patientId]/print — Card preview and PDF download page.
 *
 * - Fetches patient profile + card metadata from the API.
 * - Renders HealthCardPreview for a visual preview before downloading.
 * - "Download PDF" triggers GET /health-cards/{patientId}/pdf (streamed file download).
 *   This endpoint requires an ACTIVE card — non-active cards cannot be PDF'd.
 * - "Print" opens browser print dialog.
 * - 404 (no card generated yet): shows "Generate Card" CTA.
 * - Non-active card (reissued/revoked/lost): shows "Reissue Card" CTA
 *   instead of Download/Print buttons, since the PDF endpoint only works
 *   for active cards.
 *
 * This is a client component so it can use hooks for data fetching and the
 * PDF download (which requires window.location for blob download in the
 * browser).
 */

import { useCallback, useEffect, useState } from "react";
import { use } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import HealthCardPreview from "@/components/cards/HealthCardPreview";
import { mapPatient, type PatientApiResponse } from "@/hooks/usePatients";
import type { CardGenerateResponse, HealthCardData } from "@/types/healthCard";
import type { Patient } from "@/types/patient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageState =
  | { phase: "loading" }
  | { phase: "no_card"; patient: Patient }
  | { phase: "ready"; patient: Patient; card: HealthCardData }
  | { phase: "error"; message: string };

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
  const [generateInProgress, setGenerateInProgress] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [reissueInProgress, setReissueInProgress] = useState(false);
  const [reissueError, setReissueError] = useState("");

  // ---------------------------------------------------------------------------
  // Fetch data on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch patient and card in parallel.
        const [patient, card] = await Promise.all([
          apiFetch<PatientApiResponse>(`/patients/${patientId}`).then(mapPatient),
          apiFetch<HealthCardData>(`/health-cards/${patientId}`),
        ]);
        setPageState({ phase: "ready", patient, card });
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            // Could be patient 404 or card 404 — check which.
            // If patient exists but card doesn't, show "Generate Card" CTA.
            try {
              const patient = await apiFetch<PatientApiResponse>(`/patients/${patientId}`).then(mapPatient);
              // Patient found but no card — keep the patient in state so the
              // "Generate Card" action below can transition straight to the
              // "ready" phase without a second round-trip.
              setPageState({ phase: "no_card", patient });
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

    // The PDF endpoint only works for active cards.  If the card is
    // non-active (reissued / revoked / lost), the backend returns 404.
    // This case is rendered with the reissue CTA instead of the PDF
    // buttons, so this guard is a safety net.
    if (pageState.card.status !== "active") {
      alert(
        `This card is ${pageState.card.status} and cannot be printed. ` +
        "Please reissue a new card first."
      );
      return;
    }

    setDownloadInProgress(true);

    try {
      // Use fetch directly for binary response (apiFetch parses JSON).
      // Use the relative proxy path so Next.js rewrites the request to the
      // backend — this ensures cookies are scoped correctly and avoids CORS.
      const response = await fetch(
        `/api/v1/health-cards/${patientId}/pdf`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        // Parse the backend error envelope if available.
        let errorMessage = `PDF generation failed (HTTP ${response.status}).`;
        try {
          const body = (await response.json()) as {
            error?: { message?: string };
          };
          if (body?.error?.message) errorMessage = body.error.message;
        } catch {
          // Non-JSON response — keep the generic message.
        }
        throw new Error(errorMessage);
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
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to download PDF. Please try again.");
    } finally {
      setDownloadInProgress(false);
    }
  }, [pageState, patientId]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // ---------------------------------------------------------------------------
  // Generate card (no_card phase CTA)
  // ---------------------------------------------------------------------------

  const handleGenerateCard = useCallback(async () => {
    if (pageState.phase !== "no_card") return;
    setGenerateInProgress(true);
    setGenerateError("");

    try {
      const resp = await apiFetch<CardGenerateResponse>(
        `/health-cards/${patientId}/generate`,
        { method: "POST" }
      );
      setPageState({
        phase: "ready",
        patient: pageState.patient,
        card: { ...resp.card, qr_data_uri: resp.qr_data_uri },
      });
    } catch (err) {
      setGenerateError(
        err instanceof ApiError
          ? err.message
          : "Failed to generate health card. Please try again."
      );
    } finally {
      setGenerateInProgress(false);
    }
  }, [pageState, patientId]);

  // ---------------------------------------------------------------------------
  // Reissue card (ready phase — when current card is non-active)
  // ---------------------------------------------------------------------------

  const handleReissueCard = useCallback(async () => {
    if (pageState.phase !== "ready") return;
    setReissueInProgress(true);
    setReissueError("");

    try {
      const resp = await apiFetch<CardGenerateResponse>(
        `/health-cards/${patientId}/reissue`,
        { method: "POST" }
      );
      setPageState({
        phase: "ready",
        patient: pageState.patient,
        card: { ...resp.card, qr_data_uri: resp.qr_data_uri },
      });
    } catch (err) {
      setReissueError(
        err instanceof ApiError
          ? err.message
          : "Failed to reissue health card. Please try again."
      );
    } finally {
      setReissueInProgress(false);
    }
  }, [pageState, patientId]);

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
        {generateError && (
          <p
            role="alert"
            style={{ margin: "0 0 16px", color: "#dc2626", fontSize: "13px" }}
          >
            {generateError}
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleGenerateCard()}
          disabled={generateInProgress}
          style={{
            display: "inline-block",
            padding: "10px 24px",
            borderRadius: "8px",
            backgroundColor: "#0d9488",
            color: "#ffffff",
            border: "none",
            fontWeight: "bold",
            fontSize: "14px",
            cursor: generateInProgress ? "not-allowed" : "pointer",
            opacity: generateInProgress ? 0.7 : 1,
          }}
        >
          {generateInProgress ? "Generating…" : "Generate Health Card"}
        </button>
      </div>
    );
  }

  const { patient, card } = pageState;
  const isCardActive = card.status === "active";

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

      {/* Non-active card warning + reissue CTA */}
      {!isCardActive && (
        <div
          role="alert"
          style={{
            padding: "16px",
            borderRadius: "8px",
            backgroundColor: "#fef9c3",
            border: "1px solid #fde047",
            color: "#713f12",
            marginBottom: "20px",
          }}
        >
          <p style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: "bold" }}>
            This card is <strong>{card.status}</strong> and cannot be printed.
          </p>
          <p style={{ margin: "0 0 16px", fontSize: "13px" }}>
            The PDF endpoint only works for active cards. Reissue a new card to
            generate a printable PDF with a fresh QR code.
          </p>
          {reissueError && (
            <p role="alert" style={{ margin: "0 0 12px", color: "#dc2626", fontSize: "13px" }}>
              {reissueError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleReissueCard()}
            disabled={reissueInProgress}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              backgroundColor: "#b45309",
              color: "#ffffff",
              border: "none",
              fontWeight: "bold",
              fontSize: "14px",
              cursor: reissueInProgress ? "not-allowed" : "pointer",
              opacity: reissueInProgress ? 0.7 : 1,
            }}
          >
            {reissueInProgress ? "Reissuing..." : "Reissue Health Card"}
          </button>
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

      {/* Action buttons — only shown for active cards */}
      {isCardActive && (
        <>
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
            The PDF will be printed at CR80 card size (85.6mm x 54mm).
            Use a dedicated card printer for best results.
          </p>
        </>
      )}
    </div>
  );
}
