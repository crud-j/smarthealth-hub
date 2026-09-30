"use client";
/**
 * Registration QR Code Generator
 * URL: /settings/registration-qr
 * Auth: All authenticated staff
 *
 * Generates a one-time pre-visit intake link and QR code for walk-in patients.
 * "Regenerate" creates a fresh token — the URL changes each time.
 * The permanent public intake URL is shown in the side panel for Facebook/social media.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Printer,
  QrCode,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Swal from "sweetalert2";
import { apiFetch, ApiError } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegistrationUrlInfo {
  registration_url: string; // permanent public /intake URL
  qr_base_url: string;
  bhc_name: string;
}

interface PreVisitToken {
  token: string;
  intake_url: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// QR generation (client-side using the qrcode npm package)
// ---------------------------------------------------------------------------

async function generateQrDataUrl(url: string, size: number): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(url, {
    width: size,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#1a0808", light: "#ffffff" },
  });
}

async function generateQrSvgString(url: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toString(url, {
    type: "svg",
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#1a0808", light: "#ffffff" },
  } as Parameters<typeof QRCode.toString>[1]);
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

// ---------------------------------------------------------------------------
// Print poster — opens a new window with a self-contained A4 poster
// ---------------------------------------------------------------------------

function printPoster(
  bhcName: string,
  activeUrl: string,
  qrDataUrl: string,
  expiresAt: string | null,
) {
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) {
    void Swal.fire({
      icon: "warning",
      title: "Pop-up Blocked",
      text: "Allow pop-ups for this site then try again.",
      confirmButtonColor: "#b5343e",
    });
    return;
  }

  const expiryLine = expiresAt
    ? `<div class="expiry">This link expires on <strong>${new Date(expiresAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</strong> — one-time use</div>`
    : "";

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Patient Intake QR — ${bhcName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .poster {
      width: 210mm;
      min-height: 297mm;
      background: #fff9f8;
      border: 1px solid #e8b4b8;
      display: flex;
      flex-direction: column;
      align-items: center;
      overflow: hidden;
    }
    .top-bar { width: 100%; height: 12px; background: #b5343e; }
    .header {
      width: 100%;
      background: #fdf0f0;
      padding: 28px 40px 24px;
      text-align: center;
      border-bottom: 2px solid #e8b4b8;
    }
    .bhc-name { font-size: 22px; font-weight: 800; color: #1a0808; margin-bottom: 4px; }
    .bhc-sub { font-size: 13px; color: #6b4f4f; }
    .body { padding: 32px 40px; flex: 1; display: flex; flex-direction: column; align-items: center; }
    .title { font-size: 30px; font-weight: 900; color: #b5343e; text-align: center; margin-bottom: 8px; }
    .subtitle { font-size: 16px; color: #3d2222; text-align: center; margin-bottom: 12px; }
    .expiry { font-size: 12px; color: #9c8080; text-align: center; margin-bottom: 28px; }
    .qr-card {
      background: white;
      border: 2px solid #e8b4b8;
      border-radius: 20px;
      padding: 20px;
      box-shadow: 0 4px 24px rgba(90,30,30,0.1);
      margin-bottom: 28px;
    }
    .qr-card img { display: block; width: 280px; height: 280px; }
    .steps {
      width: 100%;
      background: white;
      border: 1px solid #e8b4b8;
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 24px;
    }
    .steps-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #9c8080;
      margin-bottom: 12px;
    }
    .step { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
    .step-num {
      width: 24px; height: 24px; border-radius: 50%;
      background: #b5343e; color: white;
      font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .step-text { font-size: 14px; color: #3d2222; line-height: 1.5; padding-top: 2px; }
    .url-box {
      width: 100%;
      background: #fdf0f0;
      border: 1.5px solid #e8b4b8;
      border-radius: 10px;
      padding: 14px 20px;
      text-align: center;
    }
    .url-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9c8080; margin-bottom: 4px; }
    .url-text { font-family: 'Courier New', monospace; font-size: 12px; font-weight: 700; color: #b5343e; word-break: break-all; }
    .bottom-bar { width: 100%; height: 12px; background: #b5343e; margin-top: auto; }
    @media print { body { background: white; } .poster { border: none; width: 100%; } }
  </style>
</head>
<body>
  <div class="poster">
    <div class="top-bar"></div>
    <div class="header">
      <div class="bhc-name">${bhcName}</div>
      <div class="bhc-sub">Patubig, Marilao, Bulacan</div>
    </div>
    <div class="body">
      <div class="title">PATIENT INTAKE FORM</div>
      <div class="subtitle">Scan the QR code below to fill your pre-visit information</div>
      ${expiryLine}
      <div class="qr-card">
        <img src="${qrDataUrl}" alt="Patient Intake QR Code"/>
      </div>
      <div class="steps">
        <div class="steps-title">How to Use</div>
        <div class="step">
          <div class="step-num">1</div>
          <div class="step-text">Open your phone camera and point it at the QR code above.</div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-text">Tap the link that appears on your screen.</div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-text">Fill out the form completely and submit. Note your <strong>reference number</strong>.</div>
        </div>
      </div>
      <div class="url-box">
        <div class="url-label">Or type this address in your browser</div>
        <div class="url-text">${activeUrl}</div>
      </div>
    </div>
    <div class="bottom-bar"></div>
  </div>
  <script>window.onload = () => window.print();<\/script>
</body>
</html>`);
  win.document.close();
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function RegistrationQrPage() {
  const [info, setInfo] = useState<RegistrationUrlInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The active pre-visit token — generates a /intake/{token} URL
  const [activeToken, setActiveToken] = useState<PreVisitToken | null>(null);
  const [activeUrl, setActiveUrl] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [publicCopied, setPublicCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<RegistrationUrlInfo>("/system/registration-url");
      setInfo(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load registration URL.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchInfo(); }, [fetchInfo]);

  // Generate (or regenerate) a new pre-visit token
  async function handleGenerate() {
    if (!info) return;
    setGenerating(true);
    setGenError(null);
    try {
      const token = await apiFetch<PreVisitToken>("/patients/intake-token", { method: "POST" });
      // Build URL from QR_BASE_URL so it uses the Cloudflare tunnel
      const url = `${info.qr_base_url.trim().replace(/\/$/, "")}/intake/${token.token}`;
      const qr = await generateQrDataUrl(url, 512);
      setActiveToken(token);
      setActiveUrl(url);
      setQrDataUrl(qr);
    } catch (e) {
      setGenError(e instanceof ApiError ? e.message : "Failed to generate link. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadPng() {
    if (!qrDataUrl || !activeToken) return;
    downloadDataUrl(qrDataUrl, `intake-qr-${activeToken.token.slice(0, 8)}.png`);
    await Swal.fire({
      icon: "success", title: "Downloaded!", timer: 2000,
      showConfirmButton: false, toast: true, position: "bottom-end",
    });
  }

  async function handleDownloadSvg() {
    if (!activeUrl) return;
    try {
      const svg = await generateQrSvgString(activeUrl);
      downloadBlob(svg, `intake-qr-${activeToken?.token.slice(0, 8) ?? "public"}.svg`, "image/svg+xml");
      await Swal.fire({
        icon: "success", title: "Downloaded!", timer: 2000,
        showConfirmButton: false, toast: true, position: "bottom-end",
      });
    } catch {
      await Swal.fire({ icon: "error", title: "SVG Error", text: "Could not generate SVG.", confirmButtonColor: "#b5343e" });
    }
  }

  function handlePrint() {
    if (!info || !qrDataUrl || !activeUrl) return;
    printPoster(info.bhc_name, activeUrl, qrDataUrl, activeToken?.expires_at ?? null);
  }

  async function handleCopyUrl() {
    if (!activeUrl) return;
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await Swal.fire({ icon: "error", title: "Copy failed", text: "Please copy the URL manually.", confirmButtonColor: "#b5343e" });
    }
  }

  async function handleCopyPublicUrl() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.registration_url);
      setPublicCopied(true);
      setTimeout(() => setPublicCopied(false), 2000);
    } catch {
      await Swal.fire({ icon: "error", title: "Copy failed", text: "Please copy the URL manually.", confirmButtonColor: "#b5343e" });
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">

      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 ring-1 ring-rose-100">
            <QrCode size={20} className="text-rose-600" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Registration QR Code
          </h1>
        </div>
        <p className="text-sm text-slate-500">
          Generate a patient intake QR code for walk-ins. Each link is unique — click <strong>Regenerate</strong> to create a fresh one for the next patient.
        </p>
      </header>

      {/* System error */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void fetchInfo()}
            className="ml-auto flex items-center gap-1 text-xs font-semibold hover:underline"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">

        {/* Left — QR + actions */}
        <div className="space-y-6">

          {/* Active URL card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">
              Pre-Visit Form Link
            </p>

            {activeUrl ? (
              <>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-lg bg-slate-50 px-3 py-2 text-sm font-mono text-rose-700 ring-1 ring-slate-100">
                    {activeUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void handleCopyUrl()}
                    title="Copy URL"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                  >
                    {copied ? (
                      <span className="text-xs font-bold text-green-600">✓</span>
                    ) : (
                      <Copy size={15} />
                    )}
                  </button>
                  <a
                    href={activeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open intake form"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                  >
                    <ExternalLink size={15} />
                  </a>
                </div>
                {activeToken && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
                    Expires{" "}
                    <strong className="text-slate-600">
                      {new Date(activeToken.expires_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                    </strong>
                    {" "}· one-time use
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-400 italic">
                No link generated yet — click <strong className="text-slate-600 not-italic">Generate Pre-Visit Link</strong> below.
              </p>
            )}
          </div>

          {/* QR preview */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">QR Code</p>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={generating || loading}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <RefreshCw size={12} className={generating ? "animate-spin" : ""} />
                Regenerate
              </button>
            </div>

            <div className="flex items-center justify-center rounded-xl bg-slate-50 py-8">
              {loading || generating ? (
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <Loader2 size={32} className="animate-spin" />
                  <span className="text-sm">{loading ? "Loading…" : "Generating QR code…"}</span>
                </div>
              ) : qrDataUrl ? (
                <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl}
                    alt="Patient Intake QR Code"
                    width={240}
                    height={240}
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                    <QrCode size={40} className="text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">No QR code yet</p>
                    <p className="mt-1 text-xs text-slate-400">Generate a pre-visit link to see the QR code</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleGenerate()}
                    disabled={generating || loading}
                    className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-40 transition-colors active:scale-[0.97]"
                    style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}
                  >
                    <Sparkles size={15} />
                    Generate Pre-Visit Link
                  </button>
                </div>
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {/* Generation error */}
            {genError && (
              <p className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                <AlertCircle size={13} className="shrink-0" />
                {genError}
              </p>
            )}
          </div>

          {/* Export & print — only shown once a QR exists */}
          {qrDataUrl && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-4 text-sm font-semibold text-slate-700">Export &amp; Print</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

                <button
                  type="button"
                  onClick={() => void handleDownloadPng()}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors active:scale-[0.97]"
                >
                  <Download size={16} className="text-slate-500" />
                  Download PNG
                </button>

                <button
                  type="button"
                  onClick={() => void handleDownloadSvg()}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors active:scale-[0.97]"
                >
                  <Download size={16} className="text-slate-500" />
                  Download SVG
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-rose-700 transition-colors active:scale-[0.97]"
                >
                  <Printer size={16} />
                  Print Poster
                </button>

              </div>
              <p className="mt-3 text-xs text-slate-400">
                <strong>Print Poster</strong> opens a print-ready A4 page. Print → show to the patient or display at the counter.
              </p>
            </div>
          )}

        </div>

        {/* Right — info panel */}
        <aside className="space-y-4">

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
            <p className="mb-2 font-bold">How this works</p>
            <ol className="space-y-1.5 list-decimal list-inside text-xs leading-relaxed">
              <li>Click <strong>Generate Pre-Visit Link</strong> to create a unique QR code.</li>
              <li>Patient scans the QR → fills the intake form → submits.</li>
              <li>Draft appears in <strong>Registrations → Pre-visit Drafts</strong>.</li>
              <li>Staff review and <strong>Finalize</strong> to create the patient record.</li>
              <li>Click <strong>Regenerate</strong> to get a fresh link for the next patient.</li>
            </ol>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs text-amber-700">
            <p className="font-semibold mb-1">One-time use</p>
            <p className="leading-relaxed">Each link expires in 48 hours and can only be used once. Regenerate for each new patient.</p>
          </div>

          {/* Public URL — for Facebook / social media */}
          {info && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                Public Registration Link
              </p>
              <p className="mb-3 text-xs text-slate-500 leading-relaxed">
                Permanent link for Facebook posts or a laminated poster — no token required.
              </p>
              <code className="mb-3 block overflow-x-auto rounded-lg bg-slate-50 px-3 py-2 text-xs font-mono text-rose-700 ring-1 ring-slate-100 break-all">
                {info.registration_url}
              </code>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyPublicUrl()}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  {publicCopied ? <span className="text-green-600">✓ Copied</span> : <><Copy size={12} /> Copy URL</>}
                </button>
                <a
                  href={info.registration_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <ExternalLink size={12} /> Preview
                </a>
              </div>
            </div>
          )}

        </aside>
      </div>
    </main>
  );
}
