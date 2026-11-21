/**
 * Public QR verification page — /verify?pid=...&v=...&sig=...
 *
 * This page is intentionally outside the (dashboard) auth layout so that
 * anyone who scans the health card QR with a mobile phone can reach it
 * without logging in.
 *
 * It verifies the HMAC signature server-side and shows a minimal,
 * PHI-safe confirmation: card is valid / invalid + the patient's name.
 * No sensitive medical data is exposed here.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Card Verification",
  robots: { index: false, follow: false },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerifySearchParams {
  pid?: string;
  v?: string;
  sig?: string;
}

interface VerifyResult {
  valid: boolean;
  full_name?: string;
  patient_code?: string;
  card_status?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Server-side verification — calls the public GET endpoint (no JWT required)
// ---------------------------------------------------------------------------

async function verifyCard(
  pid: string,
  v: string,
  sig: string
): Promise<VerifyResult> {
  // SERVER-SIDE_API_URL is the internal address reachable from the Next.js
  // server process (e.g. http://localhost:8000 in dev, or http://backend:8000
  // in Docker). It is NOT exposed to the browser, so no NEXT_PUBLIC_ prefix.
  // Strip /api/v1 suffix if present — we build the full path ourselves.
  const apiBase = (
    process.env.SERVER_SIDE_API_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/api\/v1\/?$/, "") ??
    "http://localhost:8000"
  );

  const params = new URLSearchParams({ pid, v, sig });

  try {
    const res = await fetch(
      `${apiBase}/api/v1/health-cards/verify/public?${params.toString()}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      return { valid: false, error: "Verification service unavailable. Please try again later." };
    }

    const data = (await res.json()) as {
      valid: boolean;
      full_name?: string;
      patient_code?: string;
      card_status?: string;
    };

    if (!data.valid) {
      return { valid: false, error: "Signature invalid or card has been revoked." };
    }

    return {
      valid: true,
      full_name: data.full_name,
      patient_code: data.patient_code,
      card_status: data.card_status,
    };
  } catch {
    return { valid: false, error: "Could not reach the verification service." };
  }
}

// ---------------------------------------------------------------------------
// Page component (Server Component — no "use client" needed)
// ---------------------------------------------------------------------------

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<VerifySearchParams>;
}) {
  const { pid, v, sig } = await searchParams;

  // ── Missing params ────────────────────────────────────────────────────────
  if (!pid || !v || !sig) {
    return <VerifyLayout><InvalidCard reason="Invalid QR code — missing required parameters." /></VerifyLayout>;
  }

  const result = await verifyCard(pid, v, sig);

  return (
    <VerifyLayout>
      {result.valid ? (
        <ValidCard
          fullName={result.full_name ?? "Unknown"}
          patientCode={result.patient_code ?? "—"}
          cardStatus={result.card_status ?? "active"}
          pid={pid}
        />
      ) : (
        <InvalidCard reason={result.error ?? "Card could not be verified."} />
      )}
    </VerifyLayout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components — same look as the sign-in pages (rose theme, BHC logo,
// DM Serif Display headings, warm ink); status colours: teal = good,
// amber = real card but not active, red = could not verify.
// ---------------------------------------------------------------------------

const INK = "text-[#2a1414]";
const MUTED = "text-[#8a6a6a]";

function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="rose" className="flex min-h-screen items-center justify-center bg-[#f5efe9] px-4 py-8">
      <main className="w-full max-w-[420px]">
        <header className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/BHCFINALLOGO.png"
            alt="Barangay Health Center logo"
            width={56}
            height={56}
            className="h-14 w-14 rounded-full shadow-sm ring-4 ring-white"
          />
          <p className={`mt-3 text-sm font-semibold ${INK}`}>SmartHealth Hub</p>
          <p className={`text-xs ${MUTED}`}>Barangay Health Center · Health card check</p>
        </header>

        {children}

        <p className={`mt-6 text-center text-[11px] ${MUTED}`}>
          This page shows only the name and patient code on the card. No health records are shown.
        </p>
      </main>
    </div>
  );
}

function StatusIcon({ tone }: { tone: "ok" | "warn" | "fail" }) {
  const styles = {
    ok: "bg-teal-50 text-teal-600 ring-teal-100",
    warn: "bg-amber-50 text-amber-600 ring-amber-100",
    fail: "bg-red-50 text-red-600 ring-red-100",
  }[tone];
  return (
    <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ring-8 ${styles}`} aria-hidden="true">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        {tone === "ok" && <path d="M20 6 9 17l-5-5" />}
        {tone === "warn" && (
          <>
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </>
        )}
        {tone === "fail" && (
          <>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </>
        )}
      </svg>
    </div>
  );
}

const CARD = "rounded-3xl border border-[#eadbd3] bg-white px-6 py-7 shadow-[0_1px_2px_rgba(60,20,20,0.04),0_12px_32px_-16px_rgba(120,40,40,0.18)]";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function statusLabel(status: string): string {
  if (status === "active") return "Active card";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function ValidCard({
  fullName,
  patientCode,
  cardStatus,
  pid,
}: {
  fullName: string;
  patientCode: string;
  cardStatus: string;
  pid: string;
}) {
  const isActive = cardStatus === "active";

  return (
    <section className={CARD} aria-labelledby="verify-heading">
      <StatusIcon tone={isActive ? "ok" : "warn"} />
      <h1 id="verify-heading" className={`mt-5 text-center font-display text-3xl leading-tight ${INK}`}>
        {isActive ? "Card verified" : "Card not active"}
      </h1>
      <p className={`mt-1 text-center text-sm ${MUTED}`}>
        {isActive
          ? "This health card was issued by a registered Barangay Health Center."
          : "This card is real, but it can no longer be used. Ask the health center for a new card."}
      </p>

      <div className="mt-6 flex items-center gap-4 rounded-2xl border border-[#f1e6e0] bg-[#fdf7f3] p-4">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose-100 text-base font-semibold text-rose-700"
        >
          {initials(fullName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-lg font-semibold ${INK}`}>{fullName}</p>
          <p className="font-mono text-sm font-medium text-rose-700">{patientCode}</p>
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
            isActive ? "bg-teal-50 text-teal-700 ring-teal-200" : "bg-amber-50 text-amber-800 ring-amber-200"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-teal-500" : "bg-amber-500"}`} aria-hidden="true" />
          {statusLabel(cardStatus)}
        </span>
      </div>

      {/* Staff shortcut: the full record needs a staff sign-in. */}
      <div className="mt-7 border-t border-[#f1e6e0] pt-5">
        <p className={`mb-3 text-center text-xs font-medium uppercase tracking-wider ${MUTED}`}>For health center staff</p>
        <a
          href={`/login?next=/patients/${pid}`}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#b5343e] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#9c2a33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5343e]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Sign in to view the full record
        </a>
      </div>
    </section>
  );
}

function InvalidCard({ reason }: { reason: string }) {
  return (
    <section className={CARD} aria-labelledby="verify-heading">
      <StatusIcon tone="fail" />
      <h1 id="verify-heading" className={`mt-5 text-center font-display text-3xl leading-tight ${INK}`}>
        We couldn&apos;t verify this card
      </h1>
      <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-center text-sm text-red-800">{reason}</p>
      <p className={`mt-5 text-center text-sm ${MUTED}`}>
        Scan the QR code again in good light. If it still fails, bring the card to your Barangay Health Center.
      </p>
    </section>
  );
}
