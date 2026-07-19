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
// Sub-components
// ---------------------------------------------------------------------------

function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f8fafc", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <main style={{ width: "100%", maxWidth: "420px", padding: "24px 16px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "#0d9488" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <span style={{ fontWeight: 700, fontSize: "18px" }}>SmartHealth Hub</span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
            Barangay Health Center — Card Verification
          </p>
        </div>

        {children}
      </main>
    </div>
  );
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
    <div
      style={{
        borderRadius: "16px",
        border: `2px solid ${isActive ? "#16a34a" : "#f59e0b"}`,
        background: isActive ? "#f0fdf4" : "#fffbeb",
        padding: "28px 24px",
      }}
    >
      {/* Icon */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: isActive ? "#16a34a" : "#f59e0b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-hidden="true"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}>
            {isActive ? (
              <polyline points="20 6 9 17 4 12" />
            ) : (
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            )}
          </svg>
        </div>
      </div>

      {/* Status */}
      <h1 style={{ margin: "0 0 4px", textAlign: "center", fontSize: "20px", color: isActive ? "#15803d" : "#92400e" }}>
        {isActive ? "Card Verified" : "Card Not Active"}
      </h1>
      <p style={{ margin: "0 0 20px", textAlign: "center", fontSize: "13px", color: "#64748b" }}>
        Status: <strong style={{ textTransform: "capitalize" }}>{cardStatus}</strong>
      </p>

      {/* Patient info (no PHI — just name + code) */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          padding: "16px",
          border: "1px solid #e2e8f0",
        }}
      >
        <p style={{ margin: "0 0 2px", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
          {fullName}
        </p>
        <p style={{ margin: 0, fontSize: "13px", color: "#0d9488", fontWeight: 600 }}>
          {patientCode}
        </p>
      </div>

      <p style={{ margin: "16px 0 0", textAlign: "center", fontSize: "12px", color: "#94a3b8" }}>
        This card was issued by a registered Barangay Health Center.
      </p>

      {/* Staff shortcut — takes BHC staff directly to the full patient record */}
      <div style={{ marginTop: "20px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
        <p style={{ margin: "0 0 10px", textAlign: "center", fontSize: "12px", color: "#94a3b8" }}>
          BHC Staff?
        </p>
        <a
          href={`/login?next=/patients/${pid}`}
          style={{
            display: "block",
            textAlign: "center",
            padding: "10px 16px",
            borderRadius: "8px",
            background: "#0d9488",
            color: "#ffffff",
            fontSize: "14px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          View Full Patient Record
        </a>
      </div>
    </div>
  );
}

function InvalidCard({ reason }: { reason: string }) {
  return (
    <div
      style={{
        borderRadius: "16px",
        border: "2px solid #dc2626",
        background: "#fef2f2",
        padding: "28px 24px",
        textAlign: "center",
      }}
    >
      {/* Icon */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "#dc2626",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-hidden="true"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      </div>

      <h1 style={{ margin: "0 0 8px", fontSize: "20px", color: "#dc2626" }}>
        Verification Failed
      </h1>
      <p style={{ margin: "0 0 16px", fontSize: "14px", color: "#374151" }}>
        {reason}
      </p>
      <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>
        If you believe this is an error, please contact your Barangay Health Center.
      </p>
    </div>
  );
}
