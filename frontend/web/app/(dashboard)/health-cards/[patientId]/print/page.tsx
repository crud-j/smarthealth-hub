"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import HealthCardPreview from "@/components/cards/HealthCardPreview";
import { mapPatient, type PatientApiResponse } from "@/hooks/usePatients";
import type {
  CardGenerateResponse,
  CardGenerationAccepted,
  GenerationStatus,
  HealthCardData,
} from "@/types/healthCard";
import type { Patient } from "@/types/patient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A card_number that starts with "PENDING-" means the registration task
 *  wrote a placeholder row before staff clicked Generate.  Treat it as
 *  "no card yet" so the print page shows the Generate button. */
function isPendingPlaceholder(cardNumber: string): boolean {
  return cardNumber.startsWith("PENDING-");
}

// ---------------------------------------------------------------------------
// Page state machine
// ---------------------------------------------------------------------------

type PageState =
  | { phase: "loading" }
  | { phase: "no_card"; patient: Patient }
  | { phase: "generating"; patient: Patient; cardId: string; card?: HealthCardData }
  | { phase: "pdf_pending"; patient: Patient; card: HealthCardData; cardId: string }
  | { phase: "ready"; patient: Patient; card: HealthCardData }
  | { phase: "error"; message: string };

// ---------------------------------------------------------------------------
// NFC URL hint with copy button
// ---------------------------------------------------------------------------

const NFC_BASE_URL = process.env.NEXT_PUBLIC_NFC_BASE_URL ?? "http://192.168.100.6:9000";

function NfcUrlHint({ cardNumber }: { cardNumber: string }) {
  const url = `${NFC_BASE_URL}/view/${cardNumber}`;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available — silently ignore
    }
  }, [url]);

  return (
    <div className="mt-3 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] px-4 py-3">
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#166534]">
        NFC Tools Task URL
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-mono text-[#14532d] select-all">
          {url}
        </code>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="shrink-0 rounded-md border border-[#86efac] bg-white px-3 py-1 text-xs font-semibold text-[#16a34a] hover:bg-[#f0fdf4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#16a34a]"
          aria-label="Copy NFC URL"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-[#4ade80] text-[#166534]">
        Paste this URL into NFC Tools as a Task URL. When the NFC chip is tapped it will
        open this address and the relay server will look up the patient.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function HealthCardPrintPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = use(params);

  const [pageState, setPageState] = useState<PageState>({ phase: "loading" });
  const [downloadInProgress, setDownloadInProgress] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [reissueInProgress, setReissueInProgress] = useState(false);
  const [reissueError, setReissueError] = useState("");

  // Ref to cancel polling when the component unmounts or state changes.
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Cleanup polling on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (pollingRef.current !== null) clearTimeout(pollingRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // PDF generation-status polling
  // ---------------------------------------------------------------------------
  const startPolling = useCallback(
    (cardId: string, patient: Patient, card: HealthCardData) => {
      let attempts = 0;
      const MAX_ATTEMPTS = 60; // 2 minutes at 2 s intervals

      const poll = async () => {
        attempts++;
        try {
          const status = await apiFetch<GenerationStatus>(
            `/health-cards/generation-status/${cardId}`
          );
          if (status.status === "ready") {
            // PDF is ready — transition to ready phase (Download button enabled)
            setPageState({ phase: "ready", patient, card });
            return;
          }
          if (status.status === "failed" || attempts >= MAX_ATTEMPTS) {
            // PDF failed or timed out — still show "ready" so the user can
            // use the synchronous /pdf endpoint via the Download button.
            // The /pdf endpoint renders on-demand and does not require Celery.
            setPageState({ phase: "ready", patient, card });
            return;
          }
        } catch {
          // Status endpoint error — still show ready after a few failures.
          if (attempts >= 5) {
            setPageState({ phase: "ready", patient, card });
            return;
          }
        }
        // Schedule next poll.
        pollingRef.current = setTimeout(() => void poll(), 2000);
      };

      pollingRef.current = setTimeout(() => void poll(), 2000);
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Initial data load
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function loadData() {
      try {
        const patient = await apiFetch<PatientApiResponse>(`/patients/${patientId}`).then(
          mapPatient
        );

        let card: HealthCardData | null = null;
        try {
          card = await apiFetch<HealthCardData>(`/health-cards/${patientId}`);
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) throw err;
        }

        if (card === null || isPendingPlaceholder(card.card_number)) {
          // No real card yet — show the Generate button.
          setPageState({ phase: "no_card", patient });
        } else {
          setPageState({ phase: "ready", patient, card });
        }
      } catch {
        setPageState({
          phase: "error",
          message: "Failed to load card data. Please try again.",
        });
      }
    }
    void loadData();
  }, [patientId]);

  // ---------------------------------------------------------------------------
  // Generate card handler
  // ---------------------------------------------------------------------------
  const handleGenerateCard = useCallback(async () => {
    if (pageState.phase !== "no_card") return;
    const { patient } = pageState;
    setGenerateError("");
    setPageState({ phase: "generating", patient, cardId: "" });

    try {
      // POST /health-cards/{patientId}/generate now returns HTTP 200 with
      // real card data immediately (card_number is never PENDING-).
      // PDF rendering is async — poll generation-status for PDF readiness.
      const resp = await apiFetch<CardGenerateResponse>(
        `/health-cards/${patientId}/generate`,
        { method: "POST" }
      );

      const card: HealthCardData = { ...resp.card, qr_data_uri: resp.qr_data_uri };
      const cardId = resp.card.id;

      // Transition to pdf_pending and start polling for PDF readiness.
      setPageState({ phase: "pdf_pending", patient, card, cardId });
      startPolling(cardId, patient, card);
    } catch (err) {
      setGenerateError(
        err instanceof ApiError ? err.message : "Failed to generate health card. Please try again."
      );
      setPageState({ phase: "no_card", patient });
    }
  }, [pageState, patientId, startPolling]);

  // ---------------------------------------------------------------------------
  // Reissue handler
  // ---------------------------------------------------------------------------
  const handleReissueCard = useCallback(async () => {
    if (pageState.phase !== "ready") return;
    const { patient } = pageState;
    setReissueInProgress(true);
    setReissueError("");
    try {
      const resp = await apiFetch<CardGenerateResponse>(
        `/health-cards/${patientId}/reissue`,
        { method: "POST" }
      );
      const card: HealthCardData = { ...resp.card, qr_data_uri: resp.qr_data_uri };
      setPageState({ phase: "ready", patient, card });
    } catch (err) {
      setReissueError(
        err instanceof ApiError ? err.message : "Failed to reissue health card. Please try again."
      );
    } finally {
      setReissueInProgress(false);
    }
  }, [pageState, patientId]);

  // ---------------------------------------------------------------------------
  // Download PDF handler (synchronous /pdf endpoint — works even without Celery)
  // ---------------------------------------------------------------------------
  const handleDownloadPdf = useCallback(async () => {
    if (pageState.phase !== "ready") return;
    if (pageState.card.status !== "active") {
      alert(
        `This card is ${pageState.card.status} and cannot be printed. Please reissue a new card first.`
      );
      return;
    }
    setDownloadInProgress(true);
    try {
      const response = await fetch(`/api/v1/health-cards/${patientId}/pdf`, {
        credentials: "include",
      });
      if (!response.ok) {
        let errorMessage = `PDF generation failed (HTTP ${response.status}).`;
        try {
          const body = (await response.json()) as { error?: { message?: string } };
          if (body?.error?.message) errorMessage = body.error.message;
        } catch {
          /* ignore */
        }
        throw new Error(errorMessage);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `health_card_${pageState.card.card_number}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to download PDF. Please try again."
      );
    } finally {
      setDownloadInProgress(false);
    }
  }, [pageState, patientId]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // ---------------------------------------------------------------------------
  // Render: loading
  // ---------------------------------------------------------------------------
  if (pageState.phase === "loading") {
    return (
      <div className="mx-auto max-w-[600px] px-4 py-10">
        <div className="mb-6 space-y-3">
          <div className="h-7 w-48 animate-pulse rounded-lg bg-[#e8d5cc]" />
          <div className="h-5 w-64 animate-pulse rounded bg-[#e8d5cc]" />
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-[#e8d5cc]" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: error
  // ---------------------------------------------------------------------------
  if (pageState.phase === "error") {
    return (
      <div className="mx-auto max-w-[480px] px-4 py-10">
        <div
          role="alert"
          className="overflow-hidden rounded-xl border border-[#fcc] bg-[#fef2f2]"
          style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
        >
          <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#fef2f2] to-white border-b border-[#fcc]">
            <span className="inline-block h-4 w-1 rounded-full bg-[#dc2626]" aria-hidden="true" />
            <h2 className="text-sm font-bold text-[#b91c1c]">Error</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-[#7a5252]">{pageState.message}</p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: no card (show Generate button)
  // ---------------------------------------------------------------------------
  if (pageState.phase === "no_card") {
    return (
      <div className="mx-auto max-w-[480px] px-4 py-10">
        <div
          className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50"
          style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
        >
          <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-amber-50 to-white border-b border-amber-200">
            <span
              className="inline-block h-4 w-1 rounded-full bg-amber-400"
              aria-hidden="true"
            />
            <h2 className="text-sm font-bold text-amber-900">No Card Generated</h2>
          </div>
          <div className="p-5 text-center">
            <p className="mb-5 text-sm text-amber-800">
              This patient does not have a health card yet. Generate one to assign a
              permanent card number and QR code.
            </p>
            {generateError && (
              <p role="alert" className="mb-4 text-sm text-[#dc2626]">
                {generateError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleGenerateCard()}
              className="rounded-lg px-6 py-2.5 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0d9488]"
              style={{
                background: "linear-gradient(135deg, #0f766e, #0d9488)",
              }}
            >
              Generate Health Card
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: generating (waiting for POST response)
  // ---------------------------------------------------------------------------
  if (pageState.phase === "generating") {
    return (
      <div className="mx-auto max-w-[480px] px-4 py-10">
        <div
          className="overflow-hidden rounded-xl border border-[#c7d2fe] bg-[#eef2ff]"
          style={{ boxShadow: "0 2px 10px rgba(99,102,241,0.07)" }}
        >
          <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#eef2ff] to-white border-b border-[#c7d2fe]">
            <span
              className="inline-block h-4 w-1 rounded-full bg-[#6366f1]"
              aria-hidden="true"
            />
            <h2 className="text-sm font-bold text-[#3730a3]">Generating Card...</h2>
          </div>
          <div className="flex flex-col items-center gap-4 p-8">
            <div
              className="h-10 w-10 animate-spin rounded-full border-4 border-[#c7d2fe] border-t-[#6366f1]"
              role="status"
              aria-label="Generating health card"
            />
            <p className="text-sm text-[#4338ca]">
              Assigning card number and generating QR code...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: pdf_pending (card number assigned, PDF rendering in background)
  // ---------------------------------------------------------------------------
  if (pageState.phase === "pdf_pending") {
    const { patient, card } = pageState;
    return (
      <div className="mx-auto max-w-[600px] px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl leading-tight text-[#1a0808] font-display">Health Card</h1>
          <p className="mt-1 text-sm font-medium text-[#7a5252]">
            {patient.lastName}, {patient.firstName} &middot; {patient.patientCode}
          </p>
        </div>

        {/* Card number assigned — show it immediately */}
        <div
          className="mb-6 overflow-hidden rounded-xl border border-[#c7d2fe] bg-[#eef2ff]"
          style={{ boxShadow: "0 2px 10px rgba(99,102,241,0.07)" }}
        >
          <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#eef2ff] to-white border-b border-[#c7d2fe]">
            <div
              className="h-4 w-4 animate-spin rounded-full border-2 border-[#c7d2fe] border-t-[#6366f1]"
              aria-hidden="true"
            />
            <h2 className="text-sm font-bold text-[#3730a3]">PDF Rendering...</h2>
          </div>
          <div className="p-5">
            <p className="mb-3 text-sm text-[#4338ca]">
              Card number assigned. The PDF is rendering in the background — the Download
              button will appear when it is ready (usually under 30 seconds).
            </p>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-[#6366f1]">
                  Card Number
                </dt>
                <dd className="mt-1 font-semibold text-[#1a0808]">{card.card_number}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-[#6366f1]">
                  Version
                </dt>
                <dd className="mt-1 font-semibold text-[#1a0808]">v{card.card_version}</dd>
              </div>
            </dl>
            <NfcUrlHint cardNumber={card.card_number} />
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: ready (card data available, Download PDF / Print buttons shown)
  // ---------------------------------------------------------------------------
  const { patient, card } = pageState;
  const isCardActive = card.status === "active";

  return (
    <div className="mx-auto max-w-[600px] px-4 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl leading-tight text-[#1a0808] font-display">Health Card</h1>
        <p className="mt-1 text-sm font-medium text-[#7a5252]">
          {patient.lastName}, {patient.firstName} &middot; {patient.patientCode}
        </p>
      </div>

      {/* Non-active card warning */}
      {!isCardActive && (
        <div
          role="alert"
          className="mb-6 overflow-hidden rounded-xl border border-amber-200 bg-amber-50"
          style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
        >
          <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-amber-50 to-white border-b border-amber-200">
            <span
              className="inline-block h-4 w-1 rounded-full bg-amber-400"
              aria-hidden="true"
            />
            <h2 className="text-sm font-bold text-amber-900">Card Not Printable</h2>
          </div>
          <div className="p-5">
            <p className="mb-1 text-sm font-bold text-amber-800">
              This card is <strong>{card.status}</strong> and cannot be printed.
            </p>
            <p className="mb-4 text-sm text-amber-700">
              The PDF endpoint only works for active cards. Reissue a new card to generate a
              printable PDF with a fresh QR code.
            </p>
            {reissueError && (
              <p role="alert" className="mb-3 text-sm text-[#dc2626]">
                {reissueError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleReissueCard()}
              disabled={reissueInProgress}
              className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-800 disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700"
            >
              {reissueInProgress ? "Reissuing..." : "Reissue Health Card"}
            </button>
          </div>
        </div>
      )}

      {/* Card preview */}
      <div className="mb-6 flex justify-center">
        <HealthCardPreview patient={patient} card={card} />
      </div>

      {/* Card metadata */}
      <div
        className="mb-6 overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#fdf0eb] to-white border-b border-[#edd9d0]">
          <span
            className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]"
            aria-hidden="true"
          />
          <h2 className="text-sm font-bold text-[#1a0808]">Card Details</h2>
        </div>
        <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
          {(
            [
              ["Card Number", card.card_number],
              ["Version", `v${card.card_version}`],
              ["Issued", new Date(card.issued_at).toLocaleDateString("en-PH")],
              ["NFC Linked", card.nfc_uid ? "Yes" : "Not yet"],
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-bold uppercase tracking-wider text-[#9b6e6e]">
                {label}
              </dt>
              <dd className="mt-1 font-semibold text-[#1a0808]">{value}</dd>
            </div>
          ))}
        </dl>
        {/* NFC Tools URL hint */}
        {isCardActive && (
          <div className="px-5 pb-5">
            <NfcUrlHint cardNumber={card.card_number} />
          </div>
        )}
      </div>

      {/* Action buttons — active cards only */}
      {isCardActive && (
        <>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={downloadInProgress}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0d9488]"
              style={{
                background: downloadInProgress
                  ? "#94a3b8"
                  : "linear-gradient(135deg, #0f766e, #0d9488)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" x2="12" y1="15" y2="3" />
              </svg>
              {downloadInProgress ? "Generating PDF..." : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border-2 border-[#0d9488] bg-transparent px-4 py-2 text-sm font-bold text-[#0d9488] hover:bg-[#f0fdfa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0d9488]"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect width="12" height="8" x="6" y="14" />
              </svg>
              Print
            </button>
          </div>
          <p className="mt-4 text-center text-xs text-[#c08080]">
            The PDF will be printed at CR80 card size (85.6mm x 54mm). Use a dedicated card
            printer for best results.
          </p>
        </>
      )}
    </div>
  );
}
