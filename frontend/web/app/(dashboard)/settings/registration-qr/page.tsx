"use client";
/**
 * Registration QR (pre-visit form for walk-ins)
 * URL: /settings/registration-qr
 * Auth: Admin, BHW, Admin Staff (navigation); backend allows BHW+.
 *
 * The QR code and its link are ready as soon as the page opens: it shows the
 * newest one-time link you made that a patient can still use
 * (GET /patients/intake-token/current) and makes one only when there is none
 * (POST /patients/intake-token). "New link" makes a fresh one for the next
 * patient. The permanent public sign-up link (for Facebook) is shown below.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle, Check, Copy, Download, ExternalLink, Globe, Inbox, Loader2, Printer, QrCode,
  RotateCcw, ScanLine, Smartphone, UserCheck,
} from "lucide-react";
import Swal from "sweetalert2";
import { apiFetch, ApiError } from "@/lib/api-client";
import { IconBadge, rise, text } from "@/components/dashboard/shared";

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

interface ActiveLink {
  token: PreVisitToken;
  url: string;
  qrDataUrl: string;
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

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function notify(title: string) {
  void Swal.fire({ icon: "success", title, timer: 2000, showConfirmButton: false, toast: true, position: "bottom-end" });
}

// ---------------------------------------------------------------------------
// Print poster — opens a new window with a self-contained A4 poster
// ---------------------------------------------------------------------------

function printPoster(bhcName: string, activeUrl: string, qrDataUrl: string, expiresAt: string | null) {
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
    ? `<div class="expiry">This link expires on <strong>${formatExpiry(expiresAt)}</strong> — one-time use</div>`
    : "";

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Patient Intake QR — ${bhcName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .poster { width: 210mm; min-height: 297mm; background: #fff9f8; border: 1px solid #e8b4b8; display: flex; flex-direction: column; align-items: center; overflow: hidden; }
    .top-bar { width: 100%; height: 12px; background: #b5343e; }
    .header { width: 100%; background: #fdf0f0; padding: 28px 40px 24px; text-align: center; border-bottom: 2px solid #e8b4b8; }
    .bhc-name { font-size: 22px; font-weight: 800; color: #1a0808; margin-bottom: 4px; }
    .bhc-sub { font-size: 13px; color: #6b4f4f; }
    .body { padding: 32px 40px; flex: 1; display: flex; flex-direction: column; align-items: center; }
    .title { font-size: 30px; font-weight: 900; color: #b5343e; text-align: center; margin-bottom: 8px; }
    .subtitle { font-size: 16px; color: #3d2222; text-align: center; margin-bottom: 12px; }
    .expiry { font-size: 12px; color: #9c8080; text-align: center; margin-bottom: 28px; }
    .qr-card { background: white; border: 2px solid #e8b4b8; border-radius: 20px; padding: 20px; box-shadow: 0 4px 24px rgba(90,30,30,0.1); margin-bottom: 28px; }
    .qr-card img { display: block; width: 280px; height: 280px; }
    .steps { width: 100%; background: white; border: 1px solid #e8b4b8; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; }
    .steps-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9c8080; margin-bottom: 12px; }
    .step { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
    .step-num { width: 24px; height: 24px; border-radius: 50%; background: #b5343e; color: white; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .step-text { font-size: 14px; color: #3d2222; line-height: 1.5; padding-top: 2px; }
    .url-box { width: 100%; background: #fdf0f0; border: 1.5px solid #e8b4b8; border-radius: 10px; padding: 14px 20px; text-align: center; }
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
      <div class="qr-card"><img src="${qrDataUrl}" alt="Patient Intake QR Code"/></div>
      <div class="steps">
        <div class="steps-title">How to Use</div>
        <div class="step"><div class="step-num">1</div><div class="step-text">Open your phone camera and point it at the QR code above.</div></div>
        <div class="step"><div class="step-num">2</div><div class="step-text">Tap the link that appears on your screen.</div></div>
        <div class="step"><div class="step-num">3</div><div class="step-text">Fill out the form completely and submit. Note your <strong>reference number</strong>.</div></div>
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
// Pieces
// ---------------------------------------------------------------------------

const CARD =
  "rounded-3xl border border-[#eadbd3] bg-white shadow-[0_1px_2px_rgba(60,20,20,0.04),0_12px_32px_-16px_rgba(120,40,40,0.18)]";

/** Rose corner brackets around the QR, like a camera's scan frame. */
function ScanFrame({ children }: { children: React.ReactNode }) {
  const corner = "pointer-events-none absolute h-9 w-9 border-rose-500";
  return (
    <div className="relative p-4">
      <span aria-hidden="true" className={`${corner} left-0 top-0 rounded-tl-2xl border-l-[3px] border-t-[3px]`} />
      <span aria-hidden="true" className={`${corner} right-0 top-0 rounded-tr-2xl border-r-[3px] border-t-[3px]`} />
      <span aria-hidden="true" className={`${corner} bottom-0 left-0 rounded-bl-2xl border-b-[3px] border-l-[3px]`} />
      <span aria-hidden="true" className={`${corner} bottom-0 right-0 rounded-br-2xl border-b-[3px] border-r-[3px]`} />
      {children}
    </div>
  );
}

function ActionButton({
  icon: Icon, children, onClick, primary = false, disabled = false,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 ${
        primary
          ? "bg-rose-600 text-white hover:bg-rose-700"
          : "border border-[#e5d4cc] bg-white text-[#3d2222] hover:border-rose-200 hover:bg-rose-50/60"
      }`}
    >
      <Icon size={16} aria-hidden="true" />
      {children}
    </button>
  );
}

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: ScanLine, title: "Patient scans", body: "With their phone camera, at the counter or from the printed poster." },
  { icon: Smartphone, title: "Fills in the form", body: "Their details and the reason for the visit, on their own phone." },
  { icon: Inbox, title: "You get a draft", body: "It appears in Registrations → Pre-visit Drafts." },
  { icon: UserCheck, title: "Staff finish it", body: "Check the details and Finalize to create the patient record." },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RegistrationQrPage() {
  const [info, setInfo] = useState<RegistrationUrlInfo | null>(null);
  const [active, setActive] = useState<ActiveLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [renewing, setRenewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "public" | null>(null);
  const started = useRef(false);

  async function show(token: PreVisitToken, base: RegistrationUrlInfo | null) {
    // Build from QR_BASE_URL (same setting the backend uses) so the link
    // matches the one the server reports.
    const url = base ? `${base.qr_base_url.trim().replace(/\/$/, "")}/intake/${token.token}` : token.intake_url;
    const qrDataUrl = await generateQrDataUrl(url, 512);
    setActive({ token, url, qrDataUrl });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = await apiFetch<RegistrationUrlInfo>("/system/registration-url").catch(() => null);
      setInfo(base);
      let token: PreVisitToken | null = null;
      try {
        token = await apiFetch<PreVisitToken | null>("/patients/intake-token/current");
      } catch (err) {
        // A backend from before this page change has no /current: make a link.
        if (!(err instanceof ApiError && (err.status === 404 || err.status === 405))) throw err;
      }
      token ??= await apiFetch<PreVisitToken>("/patients/intake-token", { method: "POST" });
      await show(token, base);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the pre-visit link. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Once per page visit (React dev mode runs effects twice).
    if (started.current) return;
    started.current = true;
    void load();
  }, [load]);

  async function handleNewLink() {
    setRenewing(true);
    setError(null);
    try {
      const token = await apiFetch<PreVisitToken>("/patients/intake-token", { method: "POST" });
      await show(token, info);
      notify("New link ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not make a new link. Please try again.");
    } finally {
      setRenewing(false);
    }
  }

  async function copy(value: string, which: "link" | "public") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      await Swal.fire({ icon: "error", title: "Copy failed", text: "Please copy the link by hand.", confirmButtonColor: "#b5343e" });
    }
  }

  async function handleDownloadSvg() {
    if (!active) return;
    try {
      const svg = await generateQrSvgString(active.url);
      downloadBlob(svg, `intake-qr-${active.token.token.slice(0, 8)}.svg`, "image/svg+xml");
      notify("Downloaded");
    } catch {
      await Swal.fire({ icon: "error", title: "SVG Error", text: "Could not make the SVG file.", confirmButtonColor: "#b5343e" });
    }
  }

  function handleDownloadPng() {
    if (!active) return;
    downloadDataUrl(active.qrDataUrl, `intake-qr-${active.token.token.slice(0, 8)}.png`);
    notify("Downloaded");
  }

  function handlePrint() {
    if (!active) return;
    printPoster(info?.bhc_name ?? "Barangay Health Center", active.url, active.qrDataUrl, active.token.expires_at);
  }

  const busy = loading || renewing;
  const head = rise(0);
  const main = rise(1);
  const steps = rise(2);
  const pub = rise(3);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header style={head.style} className={`mb-8 flex items-start gap-4 ${head.className}`}>
        <IconBadge icon={QrCode} tone="rose" size="lg" />
        <div>
          <h1 className={`font-display text-3xl leading-tight sm:text-4xl ${text.ink}`}>Pre-Visit Form QR</h1>
          <p className={`mt-1 max-w-2xl text-sm leading-relaxed ${text.muted}`}>
            Show this at the counter. Walk-in patients scan it to fill in the pre-visit form on their own phone while they wait.
          </p>
        </div>
      </header>

      {/* QR + link */}
      <section aria-label="Pre-visit QR code and link" style={main.style} className={`mb-8 overflow-hidden ${CARD} ${main.className}`}>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* QR side */}
          <div className="flex flex-col items-center justify-center gap-4 border-b border-[#f1e6e0] bg-[radial-gradient(circle_at_50%_35%,#fff7f5_0%,#fbefeb_70%)] px-6 py-8 lg:border-b-0 lg:border-r">
            <ScanFrame>
              <div className="flex h-[240px] w-[240px] items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-[#f1e6e0]">
                {loading ? (
                  <span className={`flex flex-col items-center gap-3 text-sm ${text.muted}`}>
                    <Loader2 size={30} className="animate-spin text-rose-400" aria-hidden="true" />
                    Preparing QR code…
                  </span>
                ) : active ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={active.token.token}
                    src={active.qrDataUrl}
                    alt="QR code for the pre-visit form"
                    width={220}
                    height={220}
                    className="dash-rise"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : (
                  <span className={`flex flex-col items-center gap-2 px-6 text-center text-sm ${text.muted}`}>
                    <QrCode size={36} className="text-stone-300" aria-hidden="true" />
                    No QR code
                  </span>
                )}
              </div>
            </ScanFrame>
            <p className={`font-display text-xl ${text.ink}`}>Scan with your phone camera</p>
            {active && (
              <p className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-200">
                <span aria-hidden="true" className="dash-pulse h-2 w-2 rounded-full bg-emerald-500" />
                Ready · one patient · until {formatExpiry(active.token.expires_at)}
              </p>
            )}
          </div>

          {/* Link + actions side */}
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span className="flex-1">{error}</span>
                {!active && (
                  <button type="button" onClick={() => void load()} className="shrink-0 font-semibold hover:underline">
                    Try again
                  </button>
                )}
              </div>
            )}

            <div>
              <h2 className={`text-xs font-semibold uppercase tracking-[0.14em] ${text.muted}`}>Pre-Visit Form Link</h2>
              {loading ? (
                <div className="mt-2 h-14 animate-pulse rounded-xl bg-[#f6ece7]" />
              ) : active ? (
                <>
                  <p
                    data-testid="active-link"
                    className="mt-2 break-all rounded-xl bg-[#fdf7f5] px-4 py-3 font-mono text-sm leading-relaxed text-rose-700 ring-1 ring-inset ring-[#f1e0da]"
                  >
                    {active.url}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton icon={copied === "link" ? Check : Copy} onClick={() => void copy(active.url, "link")}>
                      {copied === "link" ? "Copied" : "Copy link"}
                    </ActionButton>
                    <a
                      href={active.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#e5d4cc] bg-white px-4 py-2.5 text-sm font-semibold text-[#3d2222] shadow-sm hover:border-rose-200 hover:bg-rose-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
                    >
                      <ExternalLink size={16} aria-hidden="true" /> Open form
                    </a>
                  </div>
                </>
              ) : (
                <p className={`mt-2 text-sm ${text.muted}`}>No link yet.</p>
              )}
            </div>

            <div className="rounded-2xl border border-[#f1e6e0] bg-[#fffbfa] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className={`text-sm font-semibold ${text.ink}`}>Next patient?</h2>
                  <p className={`mt-0.5 text-xs leading-relaxed ${text.muted}`}>
                    Each link is for one patient. Make a new one after a patient sends the form. A link you replace still works for whoever already has it.
                  </p>
                </div>
                <ActionButton icon={RotateCcw} onClick={() => void handleNewLink()} disabled={busy}>
                  {renewing ? "Making…" : "New link"}
                </ActionButton>
              </div>
            </div>

            <div>
              <h2 className={`mb-2 text-xs font-semibold uppercase tracking-[0.14em] ${text.muted}`}>Print or share</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <ActionButton icon={Printer} onClick={handlePrint} disabled={!active || busy} primary>
                  Print poster
                </ActionButton>
                <ActionButton icon={Download} onClick={handleDownloadPng} disabled={!active || busy}>
                  PNG
                </ActionButton>
                <ActionButton icon={Download} onClick={() => void handleDownloadSvg()} disabled={!active || busy}>
                  SVG
                </ActionButton>
              </div>
              <p className={`mt-2 text-xs ${text.muted}`}>The poster is an A4 page with the QR code and simple steps for the patient.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-title" style={steps.style} className={`mb-8 ${steps.className}`}>
        <h2 id="how-title" className={`mb-4 font-display text-2xl ${text.ink}`}>How it works</h2>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative rounded-2xl border border-[#eadbd3] bg-white p-4">
              <span className="absolute right-4 top-3 font-display text-3xl text-rose-100" aria-hidden="true">{i + 1}</span>
              <IconBadge icon={step.icon} tone="rose" size="sm" />
              <p className={`mt-3 text-sm font-semibold ${text.ink}`}>
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </p>
              <p className={`mt-1 text-xs leading-relaxed ${text.muted}`}>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Public link */}
      {info && (
        <section aria-labelledby="public-title" style={pub.style} className={`flex flex-col gap-4 rounded-3xl border border-sky-100 bg-linear-to-br from-sky-50/70 to-white p-6 sm:flex-row sm:items-center ${pub.className}`}>
          <IconBadge icon={Globe} tone="sky" />
          <div className="min-w-0 flex-1">
            <h2 id="public-title" className={`text-sm font-semibold ${text.ink}`}>Public sign-up link</h2>
            <p className={`mt-0.5 text-xs leading-relaxed ${text.muted}`}>
              One permanent link for Facebook posts or a laminated poster. Sign-ups from it appear in Registrations → Online Applications for the Admin to approve.
            </p>
            <p className="mt-2 break-all font-mono text-xs text-sky-800">{info.registration_url}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <ActionButton icon={copied === "public" ? Check : Copy} onClick={() => void copy(info.registration_url, "public")}>
              {copied === "public" ? "Copied" : "Copy"}
            </ActionButton>
            <a
              href={info.registration_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#e5d4cc] bg-white px-4 py-2.5 text-sm font-semibold text-[#3d2222] shadow-sm hover:border-rose-200 hover:bg-rose-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
            >
              <ExternalLink size={16} aria-hidden="true" /> Preview
            </a>
          </div>
        </section>
      )}
    </main>
  );
}
