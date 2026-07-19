"use client";

/**
 * /health-cards/verify — Live front-desk card verification screen.
 *
 * Two tabs:
 *   QR Tab  — Camera feed via getUserMedia, each frame decoded in
 *             qrScanner.worker.ts via useWebWorker<QrScannerApi>.
 *             Falls back to decodeFrameOnMainThread() when Worker unavailable
 *             (per SDP §7.4.4).
 *
 *   NFC Tab — NfcScanButton component triggers NDEFReader tap.
 *
 * Both paths:
 *   1. Call POST /api/v1/health-cards/verify?full=true with the decoded payload.
 *   2. On 200: show Patient Quick View with navigation actions.
 *   3. On 403: show generic "Card could not be verified" message.
 *   4. On other errors: show generic error without leaking details.
 *
 * TypeScript strict: no `any`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { parseQrPayload, decodeFrameOnMainThread } from "@/lib/qr";
import { useWebWorker } from "@/hooks/useWebWorker";
import NfcScanButton from "@/components/cards/NfcScanButton";
import type {
  PatientVerifySummaryFull,
  NfcPayload,
  CardVerifyRequest,
} from "@/types/healthCard";
import type { QrScannerApi } from "@/workers/qrScanner.worker";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Host portion for building absolute photo URLs.
 * Falls back to the API base URL, stripping the "/api/v1" path suffix so we
 * get the root host (e.g. "http://192.168.100.6:8000").
 */
const API_HOST = (() => {
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
  // Remove trailing /api/v1 (or /api/v1/) to get the bare host.
  return base.replace(/\/api\/v1\/?$/, "");
})();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "qr" | "nfc";
type VerifyState =
  | { phase: "idle" }
  | { phase: "scanning" }
  | { phase: "loading" }
  | { phase: "success"; summary: PatientVerifySummaryFull }
  | { phase: "error"; message: string };

// ---------------------------------------------------------------------------
// Placeholder SVG avatar (displayed when patient has no photo)
// ---------------------------------------------------------------------------

function AvatarPlaceholder({ size }: { size: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <rect width="100" height="100" fill="#e2e8f0" />
      <circle cx="50" cy="35" r="18" fill="#94a3b8" />
      <ellipse cx="50" cy="80" rx="28" ry="22" fill="#94a3b8" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Priority flag badge
// ---------------------------------------------------------------------------

interface FlagBadgeProps {
  label: string;
  icon: string;
}

function FlagBadge({ label, icon }: FlagBadgeProps): React.ReactElement {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px 10px",
        borderRadius: "999px",
        backgroundColor: "#fef9c3",
        border: "1px solid #fde047",
        color: "#713f12",
        fontSize: "12px",
        fontWeight: "bold",
      }}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Patient Quick View component
// ---------------------------------------------------------------------------

interface PatientQuickViewProps {
  summary: PatientVerifySummaryFull;
  onScanAnother: () => void;
}

function PatientQuickView({
  summary,
  onScanAnother,
}: PatientQuickViewProps): React.ReactElement {
  const router = useRouter();
  const [pdfLoading, setPdfLoading] = useState(false);

  // Format birth date "YYYY-MM-DD" → "Mar 15, 1990"
  const formattedBirthDate = (() => {
    if (!summary.birth_date) return "";
    const [year, month, day] = summary.birth_date.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  })();

  // Format last visit date
  const formattedLastVisit = summary.last_visit_date
    ? new Date(summary.last_visit_date).toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // Capitalise sex display
  const sexDisplay =
    summary.sex === "male"
      ? "Male"
      : summary.sex === "female"
        ? "Female"
        : summary.sex;

  // Absolute photo URL or null
  const photoAbsoluteUrl = summary.photo_url
    ? `${API_HOST}${summary.photo_url}`
    : null;

  // Card status indicator — green if active, yellow warning otherwise
  const isActive = summary.card_status === "active";

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  const handleStartConsultation = () => {
    void router.push(
      `/patients/${summary.patient_id}?action=new-visit`
    );
  };

  const handleViewFullRecord = () => {
    void router.push(`/patients/${summary.patient_id}`);
  };

  const handleBookAppointment = () => {
    void router.push(`/appointments?patient_id=${summary.patient_id}`);
  };

  const handlePrintCard = async () => {
    setPdfLoading(true);
    try {
      // Fetch the PDF blob from the authenticated endpoint.
      const response = await fetch(
        `${API_HOST}/api/v1/health-cards/${summary.patient_id}/pdf`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error(`PDF request failed: HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      // Open in a new tab — browser handles the print dialog.
      window.open(blobUrl, "_blank");
      // Revoke after a short delay to allow the tab to load.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    } catch {
      // Non-blocking — show a minimal inline alert rather than crashing the UI.
      alert(
        "Could not generate the health card PDF. Please try again or check the connection."
      );
    } finally {
      setPdfLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      style={{
        maxWidth: "520px",
        margin: "32px auto",
        padding: "0 16px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          borderRadius: "16px",
          border: `2px solid ${isActive ? "#16a34a" : "#f59e0b"}`,
          backgroundColor: "#ffffff",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}
      >
        {/* ── Header band ──────────────────────────────────────────────── */}
        <div
          style={{
            backgroundColor: isActive ? "#f0fdf4" : "#fffbeb",
            borderBottom: `1px solid ${isActive ? "#bbf7d0" : "#fde68a"}`,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span
            style={{
              fontSize: "13px",
              fontWeight: "700",
              color: isActive ? "#15803d" : "#92400e",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {isActive ? (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Card Verified Successfully
              </>
            ) : (
              <>
                <span aria-hidden="true">⚠</span>
                Card status: {summary.card_status}
              </>
            )}
          </span>

          <button
            type="button"
            onClick={onScanAnother}
            style={{
              padding: "6px 14px",
              borderRadius: "8px",
              backgroundColor: "transparent",
              color: "#64748b",
              border: "1px solid #cbd5e1",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Scan Another
          </button>
        </div>

        {/* ── Patient identity section ──────────────────────────────────── */}
        <div
          style={{
            padding: "20px",
            display: "flex",
            gap: "16px",
            alignItems: "flex-start",
          }}
        >
          {/* Avatar */}
          <div
            style={{
              flexShrink: 0,
              width: "72px",
              height: "72px",
              borderRadius: "50%",
              overflow: "hidden",
              border: "2px solid #e2e8f0",
              backgroundColor: "#f8fafc",
            }}
            aria-label="Patient photo"
          >
            {photoAbsoluteUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoAbsoluteUrl}
                alt={`Photo of ${summary.full_name}`}
                width={72}
                height={72}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => {
                  // If the photo fails to load, hide the broken image and
                  // fall back to the placeholder via a sibling element.
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  const sibling = e.currentTarget
                    .nextElementSibling as HTMLElement | null;
                  if (sibling) sibling.style.display = "block";
                }}
              />
            ) : null}
            {/* Placeholder is shown when no photo_url or on image load error */}
            <div
              style={{
                display: photoAbsoluteUrl ? "none" : "block",
              }}
            >
              <AvatarPlaceholder size={72} />
            </div>
          </div>

          {/* Name / demographics */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                margin: "0 0 2px",
                fontSize: "18px",
                fontWeight: "700",
                color: "#0f172a",
                lineHeight: 1.25,
                wordBreak: "break-word",
              }}
            >
              {summary.full_name}
            </h2>
            <p
              style={{
                margin: "0 0 6px",
                fontSize: "13px",
                color: "#0d9488",
                fontWeight: "700",
                letterSpacing: "0.03em",
              }}
            >
              {summary.patient_code}
            </p>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: "13px",
                color: "#374151",
              }}
            >
              {summary.age} yrs &bull; {sexDisplay}
              {formattedBirthDate ? ` • ${formattedBirthDate}` : ""}
            </p>
            {summary.mobile_number && (
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "#374151",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span aria-hidden="true">📞</span>
                {summary.mobile_number}
              </p>
            )}
          </div>
        </div>

        {/* ── Last visit + priority flags ───────────────────────────────── */}
        <div
          style={{
            padding: "0 20px 16px",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          {formattedLastVisit && (
            <p
              style={{
                margin: "0 0 10px",
                fontSize: "13px",
                color: "#64748b",
              }}
            >
              Last Visit:{" "}
              <strong style={{ color: "#374151" }}>{formattedLastVisit}</strong>
            </p>
          )}

          {(summary.is_pregnant || summary.is_senior || summary.is_pwd) && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
              }}
              aria-label="Priority flags"
            >
              {summary.is_pregnant && (
                <FlagBadge label="Pregnant" icon="🤰" />
              )}
              {summary.is_senior && (
                <FlagBadge label="Senior Citizen" icon="👴" />
              )}
              {summary.is_pwd && <FlagBadge label="PWD" icon="♿" />}
            </div>
          )}
        </div>

        {/* ── Quick action buttons ──────────────────────────────────────── */}
        <div
          style={{
            padding: "16px 20px 20px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
        >
          {/* Start Consultation / Log Visit */}
          <button
            type="button"
            onClick={handleStartConsultation}
            style={{
              padding: "12px 8px",
              borderRadius: "10px",
              backgroundColor: "#0d9488",
              color: "#ffffff",
              border: "none",
              fontSize: "13px",
              fontWeight: "700",
              cursor: "pointer",
              lineHeight: 1.3,
              textAlign: "center",
            }}
          >
            Start Consultation
          </button>

          {/* View Full Record */}
          <button
            type="button"
            onClick={handleViewFullRecord}
            style={{
              padding: "12px 8px",
              borderRadius: "10px",
              backgroundColor: "#f8fafc",
              color: "#0f172a",
              border: "1px solid #cbd5e1",
              fontSize: "13px",
              fontWeight: "700",
              cursor: "pointer",
              lineHeight: 1.3,
              textAlign: "center",
            }}
          >
            View Full Record
          </button>

          {/* Book Appointment */}
          <button
            type="button"
            onClick={handleBookAppointment}
            style={{
              padding: "12px 8px",
              borderRadius: "10px",
              backgroundColor: "#f8fafc",
              color: "#0f172a",
              border: "1px solid #cbd5e1",
              fontSize: "13px",
              fontWeight: "700",
              cursor: "pointer",
              lineHeight: 1.3,
              textAlign: "center",
            }}
          >
            Book Appointment
          </button>

          {/* Print New Card */}
          <button
            type="button"
            onClick={() => void handlePrintCard()}
            disabled={pdfLoading}
            style={{
              padding: "12px 8px",
              borderRadius: "10px",
              backgroundColor: pdfLoading ? "#e2e8f0" : "#f8fafc",
              color: pdfLoading ? "#94a3b8" : "#0f172a",
              border: "1px solid #cbd5e1",
              fontSize: "13px",
              fontWeight: "700",
              cursor: pdfLoading ? "not-allowed" : "pointer",
              lineHeight: 1.3,
              textAlign: "center",
            }}
          >
            {pdfLoading ? "Generating..." : "Print New Card"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function HealthCardVerifyPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>("qr");
  const [state, setState] = useState<VerifyState>({ phase: "idle" });

  // QR camera refs.
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanLoopRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // QR decoder worker (off main thread).
  const qrWorker = useWebWorker<QrScannerApi>(
    new URL("../../../../workers/qrScanner.worker.ts", import.meta.url)
  );

  // ---------------------------------------------------------------------------
  // API call — verify endpoint with ?full=true for staff quick view
  // ---------------------------------------------------------------------------

  const callVerifyApi = useCallback(
    async (body: CardVerifyRequest): Promise<void> => {
      setState({ phase: "loading" });
      try {
        // Pass ?full=true to receive PatientVerifySummaryFull (patient_id,
        // birth_date, mobile_number, photo_url) needed for the Quick View UI.
        const summary = await apiFetch<PatientVerifySummaryFull>(
          "/health-cards/verify?full=true",
          {
            method: "POST",
            body: JSON.stringify(body),
          }
        );
        setState({ phase: "success", summary });
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          setState({
            phase: "error",
            message:
              "Card could not be verified. Please check the card or contact staff.",
          });
        } else {
          setState({
            phase: "error",
            message: "An error occurred. Please try again.",
          });
        }
      }
    },
    []
  );

  // ---------------------------------------------------------------------------
  // QR camera — start / stop
  // ---------------------------------------------------------------------------

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({
        phase: "error",
        message:
          "Camera access is not available on this browser. " +
          "Use the NFC tab or contact IT support.",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // rear camera on phones
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setState({ phase: "scanning" });
      }
    } catch {
      setState({
        phase: "error",
        message:
          "Camera permission denied. Please allow camera access and try again.",
      });
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current !== null) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // QR scan loop — runs every animation frame
  // ---------------------------------------------------------------------------

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      scanLoopRef.current = requestAnimationFrame(() => void scanFrame());
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      scanLoopRef.current = requestAnimationFrame(() => void scanFrame());
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let decoded: string | null = null;
    if (qrWorker) {
      // Off-main-thread decode.
      decoded = await qrWorker.decodeFrame(imageData);
    } else {
      // Synchronous fallback.
      decoded = decodeFrameOnMainThread(imageData);
    }

    if (decoded) {
      // Found a QR code — stop scanning and verify.
      stopCamera();
      const parsed = parseQrPayload(decoded);
      if (parsed) {
        await callVerifyApi({ qr_payload: decoded });
      } else {
        setState({
          phase: "error",
          message: "Scanned QR code is not a valid SmartHealth Hub card.",
        });
      }
      return;
    }

    // No QR found yet — continue scanning on the next frame.
    scanLoopRef.current = requestAnimationFrame(() => void scanFrame());
  }, [qrWorker, stopCamera, callVerifyApi]);

  // Start scan loop when video is playing.
  useEffect(() => {
    if (state.phase === "scanning" && videoRef.current) {
      const video = videoRef.current;
      const onPlay = () => {
        scanLoopRef.current = requestAnimationFrame(() => void scanFrame());
      };
      video.addEventListener("play", onPlay);
      return () => {
        video.removeEventListener("play", onPlay);
        if (scanLoopRef.current !== null) {
          cancelAnimationFrame(scanLoopRef.current);
        }
      };
    }
  }, [state.phase, scanFrame]);

  // Clean up camera on tab switch or unmount.
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (tab === "qr" && state.phase === "idle") {
      void startCamera();
    }
    if (tab === "nfc") {
      stopCamera();
      setState({ phase: "idle" });
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // NFC result handler
  // ---------------------------------------------------------------------------

  const handleNfcResult = useCallback(
    (payload: NfcPayload) => {
      void callVerifyApi({ nfc_uid: payload.patient_id });
    },
    [callVerifyApi]
  );

  // ---------------------------------------------------------------------------
  // Reset scan
  // ---------------------------------------------------------------------------

  const resetScan = useCallback(() => {
    setState({ phase: "idle" });
    if (tab === "qr") void startCamera();
  }, [tab, startCamera]);

  // ---------------------------------------------------------------------------
  // Render: Patient Quick View (success)
  // ---------------------------------------------------------------------------

  if (state.phase === "success") {
    return (
      <PatientQuickView
        summary={state.summary}
        onScanAnother={resetScan}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Error overlay
  // ---------------------------------------------------------------------------

  if (state.phase === "error") {
    return (
      <div style={{ maxWidth: "480px", margin: "40px auto", padding: "0 16px" }}>
        <div
          role="alert"
          style={{
            borderRadius: "12px",
            border: "2px solid #dc2626",
            backgroundColor: "#fef2f2",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <div
            style={{ fontSize: "40px", marginBottom: "12px" }}
            aria-hidden="true"
          >
            ⚠
          </div>
          <h2 style={{ margin: "0 0 8px", color: "#dc2626" }}>
            Verification Failed
          </h2>
          <p style={{ margin: "0 0 20px", color: "#374151" }}>
            {state.message}
          </p>
          <button
            type="button"
            onClick={resetScan}
            style={{
              padding: "10px 24px",
              borderRadius: "8px",
              backgroundColor: "#dc2626",
              color: "#ffffff",
              border: "none",
              fontSize: "14px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Main verify screen (idle / scanning / loading)
  // ---------------------------------------------------------------------------

  // Capture isLoading as a boolean before narrowed-type JSX branches so the
  // NfcScanButton disabled prop does not trigger a TS no-overlap error.
  const isLoading = state.phase === "loading";

  return (
    <div style={{ maxWidth: "540px", margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: "22px", color: "#0f172a" }}>
        Verify Health Card
      </h1>
      <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#64748b" }}>
        Scan the patient&apos;s QR code or tap their NFC card to verify
        identity.
      </p>

      {/* Tab switcher */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: "20px",
        }}
        role="tablist"
      >
        {(["qr", "nfc"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: tab === t ? "bold" : "normal",
              color: tab === t ? "#0d9488" : "#64748b",
              background: "transparent",
              border: "none",
              borderBottom:
                tab === t ? "2px solid #0d9488" : "2px solid transparent",
              cursor: "pointer",
              marginBottom: "-1px",
            }}
          >
            {t === "qr" ? "QR Code" : "NFC Card"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "qr" && (
        <div
          role="tabpanel"
          aria-label="QR Code scanner"
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          {/* Loading state */}
          {state.phase === "loading" && (
            <div
              style={{ textAlign: "center", padding: "20px", color: "#0d9488" }}
            >
              Verifying...
            </div>
          )}

          {/* Camera view */}
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "1",
              backgroundColor: "#0f172a",
              borderRadius: "12px",
              overflow: "hidden",
              maxWidth: "400px",
              margin: "0 auto",
            }}
          >
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Camera feed for QR code scanning"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: state.phase === "scanning" ? "block" : "none",
              }}
            />

            {/* Viewfinder overlay */}
            {state.phase === "scanning" && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    width: "60%",
                    height: "60%",
                    border: "3px solid rgba(13, 148, 136, 0.8)",
                    borderRadius: "8px",
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
                  }}
                />
              </div>
            )}

            {/* Placeholder when not scanning */}
            {state.phase === "idle" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#94a3b8",
                  gap: "12px",
                }}
              >
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <rect width="6" height="6" x="3" y="3" rx="1" />
                  <rect width="6" height="6" x="15" y="3" rx="1" />
                  <rect width="6" height="6" x="3" y="15" rx="1" />
                  <path d="M21 15h-3v3" />
                  <path d="M15 21v-3h3" />
                  <path d="M21 21h-3v-3" />
                </svg>
                <p style={{ margin: 0, fontSize: "13px" }}>
                  Starting camera...
                </p>
              </div>
            )}
          </div>

          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} style={{ display: "none" }} />

          <p
            style={{
              textAlign: "center",
              fontSize: "13px",
              color: "#64748b",
              margin: 0,
            }}
          >
            Hold the QR code in front of the camera
          </p>
        </div>
      )}

      {tab === "nfc" && (
        <div
          role="tabpanel"
          aria-label="NFC card scanner"
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          {state.phase === "loading" ? (
            <div
              style={{
                textAlign: "center",
                padding: "20px",
                color: "#0d9488",
              }}
            >
              Verifying...
            </div>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: "14px", color: "#374151" }}>
                Ask the patient to hold their NFC health card against the back
                of this device.
              </p>
              <NfcScanButton
                onResult={handleNfcResult}
                disabled={isLoading}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
