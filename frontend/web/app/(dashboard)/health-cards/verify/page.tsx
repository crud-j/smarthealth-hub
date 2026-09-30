"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { parseQrPayload, decodeFrameOnMainThread } from "@/lib/qr";
import { useWebWorker } from "@/hooks/useWebWorker";
import NfcScanButton from "@/components/cards/NfcScanButton";
import type { PatientVerifySummaryFull, NfcPayload, CardVerifyRequest } from "@/types/healthCard";
import type { QrScannerApi } from "@/workers/qrScanner.worker";

const API_HOST = (() => {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
  return base.replace(/\/api\/v1\/?$/, "");
})();

type Tab = "qr" | "nfc";
type VerifyState =
  | { phase: "idle" }
  | { phase: "scanning" }
  | { phase: "loading" }
  | { phase: "success"; summary: PatientVerifySummaryFull }
  | { phase: "error"; message: string };

// ---------------------------------------------------------------------------
// Avatar placeholder
// ---------------------------------------------------------------------------

function AvatarPlaceholder({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: "block" }}>
      <rect width="100" height="100" fill="#edd9d0" />
      <circle cx="50" cy="35" r="18" fill="#b09090" />
      <ellipse cx="50" cy="80" rx="28" ry="22" fill="#b09090" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Flag badge
// ---------------------------------------------------------------------------

function FlagBadge({ label, icon }: { label: string; icon: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Patient Quick View
// ---------------------------------------------------------------------------

interface PatientQuickViewProps { summary: PatientVerifySummaryFull; onScanAnother: () => void; }

function PatientQuickView({ summary, onScanAnother }: PatientQuickViewProps) {
  const router = useRouter();
  const [pdfLoading, setPdfLoading] = useState(false);

  const formattedBirthDate = (() => {
    if (!summary.birth_date) return "";
    const [year, month, day] = summary.birth_date.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  })();

  const formattedLastVisit = summary.last_visit_date
    ? new Date(summary.last_visit_date).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })
    : null;

  const sexDisplay = summary.sex === "male" ? "Male" : summary.sex === "female" ? "Female" : summary.sex;
  const photoAbsoluteUrl = summary.photo_url ? `${API_HOST}${summary.photo_url}` : null;
  const isActive = summary.card_status === "active";

  async function handlePrintCard() {
    setPdfLoading(true);
    try {
      const response = await fetch(`${API_HOST}/api/v1/health-cards/${summary.patient_id}/pdf`, { credentials: "include" });
      if (!response.ok) throw new Error(`PDF request failed: HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    } catch {
      alert("Could not generate the health card PDF. Please try again or check the connection.");
    } finally { setPdfLoading(false); }
  }

  return (
    <div className="mx-auto max-w-[520px] px-4 py-8">
      <div
        className={`overflow-hidden rounded-2xl border-2 bg-white ${isActive ? "border-emerald-500" : "border-amber-400"}`}
        style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
      >
        {/* Header band */}
        <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${isActive ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
          <span className={`flex items-center gap-1.5 text-sm font-bold ${isActive ? "text-emerald-700" : "text-amber-700"}`}>
            {isActive ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Card Verified Successfully
              </>
            ) : (
              <><span aria-hidden="true">⚠</span> Card status: {summary.card_status}</>
            )}
          </span>
          <button type="button" onClick={onScanAnother}
            className="rounded-lg border border-[#d4b0b0] bg-white px-3 py-1.5 text-xs font-bold text-[#9b6e6e] hover:bg-[#fdf5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e] whitespace-nowrap">
            Scan Another
          </button>
        </div>

        {/* Patient identity */}
        <div className="flex gap-4 p-5">
          <div className="h-18 w-18 shrink-0 overflow-hidden rounded-full border-2 border-[#e5d4cc] bg-[#fdf5f0]" style={{ width: 72, height: 72 }} aria-label="Patient photo">
            {photoAbsoluteUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoAbsoluteUrl} alt={`Photo of ${summary.full_name}`} width={72} height={72} className="h-full w-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; const sibling = e.currentTarget.nextElementSibling as HTMLElement | null; if (sibling) sibling.style.display = "block"; }} />
            ) : null}
            <div style={{ display: photoAbsoluteUrl ? "none" : "block" }}><AvatarPlaceholder size={72} /></div>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="mb-0.5 text-lg font-bold text-[#1a0808] leading-tight break-words">{summary.full_name}</h2>
            <p className="mb-1 font-bold text-[#b5343e] tracking-wide text-sm">{summary.patient_code}</p>
            <p className="mb-1 text-sm text-[#3d2222]">
              {summary.age} yrs &bull; {sexDisplay}
              {formattedBirthDate ? ` · ${formattedBirthDate}` : ""}
            </p>
            {summary.mobile_number && (
              <p className="flex items-center gap-1 text-sm text-[#3d2222]">
                <span aria-hidden="true">📞</span>{summary.mobile_number}
              </p>
            )}
          </div>
        </div>

        {/* Last visit + flags */}
        <div className="border-b border-[#f0e4dd] px-5 pb-4">
          {formattedLastVisit && (
            <p className="mb-3 text-sm text-[#9b6e6e]">Last Visit: <strong className="text-[#3d2222]">{formattedLastVisit}</strong></p>
          )}
          {(summary.is_pregnant || summary.is_senior || summary.is_pwd) && (
            <div className="flex flex-wrap gap-2" aria-label="Priority flags">
              {summary.is_pregnant && <FlagBadge label="Pregnant" icon="🤰" />}
              {summary.is_senior && <FlagBadge label="Senior Citizen" icon="👴" />}
              {summary.is_pwd && <FlagBadge label="PWD" icon="♿" />}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2.5 p-5">
          <button type="button" onClick={() => void router.push(`/patients/${summary.patient_id}?action=new-visit`)}
            className="rounded-xl py-3 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
            style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}>
            Start Consultation
          </button>
          <button type="button" onClick={() => void router.push(`/patients/${summary.patient_id}`)}
            className="rounded-xl border border-[#e5d4cc] bg-[#fdf5f0] py-3 text-sm font-bold text-[#1a0808] hover:bg-[#fae8e0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
            View Full Record
          </button>
          <button type="button" onClick={() => void router.push(`/appointments?patient_id=${summary.patient_id}`)}
            className="rounded-xl border border-[#e5d4cc] bg-[#fdf5f0] py-3 text-sm font-bold text-[#1a0808] hover:bg-[#fae8e0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
            Book Appointment
          </button>
          <button type="button" onClick={() => void handlePrintCard()} disabled={pdfLoading}
            className="rounded-xl border border-[#e5d4cc] py-3 text-sm font-bold disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
            style={{ background: pdfLoading ? "#edd9d0" : "#fdf5f0", color: pdfLoading ? "#b09090" : "#1a0808" }}>
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

export default function HealthCardVerifyPage() {
  const [tab, setTab] = useState<Tab>("qr");
  const [state, setState] = useState<VerifyState>({ phase: "idle" });
  const [nfcSupported] = useState<boolean>(() => typeof window !== "undefined" && "NDEFReader" in window);
  const [nfcNoticeDismissed, setNfcNoticeDismissed] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanLoopRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const qrWorker = useWebWorker<QrScannerApi>(() =>
    new Worker(new URL("../../../../workers/qrScanner.worker.ts", import.meta.url), { type: "module" })
  );

  const callVerifyApi = useCallback(async (body: CardVerifyRequest): Promise<void> => {
    setState({ phase: "loading" });
    try {
      const summary = await apiFetch<PatientVerifySummaryFull>("/health-cards/verify?full=true", { method: "POST", body: JSON.stringify(body) });
      setState({ phase: "success", summary });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setState({ phase: "error", message: "Card could not be verified. Please check the card or contact staff." });
      } else {
        setState({ phase: "error", message: "An error occurred. Please try again." });
      }
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ phase: "error", message: "Camera access is not available on this browser. Use the NFC tab or contact IT support." });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); setState({ phase: "scanning" }); }
    } catch {
      setState({ phase: "error", message: "Camera permission denied. Please allow camera access and try again." });
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current !== null) { cancelAnimationFrame(scanLoopRef.current); scanLoopRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);

  const scanFrame = useCallback(async () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) { scanLoopRef.current = requestAnimationFrame(() => void scanFrame()); return; }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { scanLoopRef.current = requestAnimationFrame(() => void scanFrame()); return; }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let decoded: string | null = null;
    if (qrWorker) { decoded = await qrWorker.decodeFrame(imageData); } else { decoded = decodeFrameOnMainThread(imageData); }
    if (decoded) {
      stopCamera();
      const parsed = parseQrPayload(decoded);
      if (parsed) { await callVerifyApi({ qr_payload: decoded }); }
      else { setState({ phase: "error", message: "Scanned QR code is not a valid SmartHealth Hub card." }); }
      return;
    }
    scanLoopRef.current = requestAnimationFrame(() => void scanFrame());
  }, [qrWorker, stopCamera, callVerifyApi]);

  useEffect(() => {
    if (state.phase === "scanning" && videoRef.current) {
      const video = videoRef.current;
      const onPlay = () => { scanLoopRef.current = requestAnimationFrame(() => void scanFrame()); };
      video.addEventListener("play", onPlay);
      return () => { video.removeEventListener("play", onPlay); if (scanLoopRef.current !== null) { cancelAnimationFrame(scanLoopRef.current); } };
    }
  }, [state.phase, scanFrame]);

  useEffect(() => { return () => stopCamera(); }, [stopCamera]);

  useEffect(() => {
    if (tab === "qr" && state.phase === "idle") { void startCamera(); }
    if (tab === "nfc") { stopCamera(); setState({ phase: "idle" }); }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNfcResult = useCallback((payload: NfcPayload) => { void callVerifyApi({ nfc_uid: payload.patient_id }); }, [callVerifyApi]);
  const resetScan = useCallback(() => { setState({ phase: "idle" }); if (tab === "qr") void startCamera(); }, [tab, startCamera]);
  const isLoading = state.phase === "loading";

  if (state.phase === "success") {
    return <PatientQuickView summary={state.summary} onScanAnother={resetScan} />;
  }

  if (state.phase === "error") {
    return (
      <div className="mx-auto max-w-[480px] px-4 py-10">
        <div role="alert" className="overflow-hidden rounded-2xl border-2 border-[#dc2626] bg-[#fef2f2] text-center" style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.1)" }}>
          <div className="p-6">
            <div className="mb-3 text-4xl" aria-hidden="true">⚠</div>
            <h2 className="mb-2 text-lg font-bold text-[#b91c1c]">Verification Failed</h2>
            <p className="mb-5 text-sm text-[#3d2222]">{state.message}</p>
            <button type="button" onClick={resetScan}
              className="rounded-xl bg-[#dc2626] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#b91c1c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#dc2626]">
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[540px] px-4 py-6">
      <h1 className="mb-1 text-3xl leading-tight text-[#1a0808] font-display">Verify Health Card</h1>
      <p className="mb-5 text-sm font-medium text-[#9b6e6e]">Scan the patient's QR code or tap their NFC card to verify identity.</p>

      {/* Tab switcher */}
      <div className="mb-5 flex border-b border-[#e5d4cc]" role="tablist">
        {(["qr", "nfc"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px ${tab === t ? "border-[#b5343e] text-[#b5343e]" : "border-transparent text-[#9b6e6e] hover:text-[#3d2222]"}`}>
            {t === "qr" ? "QR Code" : "NFC Card"}
          </button>
        ))}
      </div>

      {/* QR tab */}
      {tab === "qr" && (
        <div role="tabpanel" aria-label="QR Code scanner" className="flex flex-col gap-3">
          {state.phase === "loading" && (
            <div className="py-5 text-center text-sm font-medium text-[#b5343e]">Verifying...</div>
          )}
          <div className="relative mx-auto w-full max-w-[400px] overflow-hidden rounded-2xl bg-[#1a0808]" style={{ aspectRatio: "1" }}>
            <video ref={videoRef} muted playsInline aria-label="Camera feed for QR code scanning"
              className="h-full w-full object-cover"
              style={{ display: state.phase === "scanning" ? "block" : "none" }} />
            {state.phase === "scanning" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <div className="h-[60%] w-[60%] rounded-xl" style={{ border: "3px solid rgba(13,148,136,0.8)", boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)" }} />
              </div>
            )}
            {state.phase === "idle" && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-[#b09090]">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <rect width="6" height="6" x="3" y="3" rx="1" /><rect width="6" height="6" x="15" y="3" rx="1" /><rect width="6" height="6" x="3" y="15" rx="1" />
                  <path d="M21 15h-3v3" /><path d="M15 21v-3h3" /><path d="M21 21h-3v-3" />
                </svg>
                <p className="text-sm">Starting camera...</p>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <p className="text-center text-sm text-[#9b6e6e]">Hold the QR code in front of the camera</p>
        </div>
      )}

      {/* NFC tab */}
      {tab === "nfc" && (
        <div role="tabpanel" aria-label="NFC card scanner" className="flex flex-col gap-4">
          {!nfcSupported && !nfcNoticeDismissed && (
            <div role="status" className="relative rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 pr-10 text-sm text-amber-800">
              NFC scanning is only supported in Chrome on Android. Use the QR code scanner instead.
              <button type="button" onClick={() => setNfcNoticeDismissed(true)} aria-label="Dismiss NFC notice"
                className="absolute right-2 top-2.5 flex h-7 w-7 items-center justify-center rounded text-amber-700 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">
                &times;
              </button>
            </div>
          )}
          {state.phase === "loading" ? (
            <div className="py-5 text-center text-sm font-medium text-[#b5343e]">Verifying...</div>
          ) : (
            <>
              <p className="text-sm text-[#3d2222]">Ask the patient to hold their NFC health card against the back of this device.</p>
              <NfcScanButton onResult={handleNfcResult} disabled={isLoading} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
