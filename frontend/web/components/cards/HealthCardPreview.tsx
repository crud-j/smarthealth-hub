"use client";

/**
 * HealthCardPreview — visual preview of the CR80 health card layout.
 *
 * Matches the WeasyPrint card_front.html design (teal header strip, patient
 * name + code left, QR code right, footer strip).
 *
 * QR image generation is offloaded to qrGenerator.worker.ts via
 * useWebWorker<QrGeneratorApi> so the main thread stays responsive.
 * Falls back to generateQrDataUri() from lib/qr.ts if Worker is unavailable
 * (per SDP §7.4.4 graceful degradation requirement).
 *
 * Props:
 *   patient — PatientResponse shape (name, patient_code, sex, birth_date, age)
 *   card    — HealthCardData (card_number, card_version, status)
 *
 * Security note: The QR image encodes ONLY the HMAC-signed URL
 * (patient_id + card_version + sig).  No PHI appears in the QR payload.
 */

import { useEffect, useState } from "react";
import type { HealthCardData } from "@/types/healthCard";
import type { Patient } from "@/types/patient";
import { useWebWorker } from "@/hooks/useWebWorker";
import { generateQrDataUri } from "@/lib/qr";
import type { QrGeneratorApi } from "@/workers/qrGenerator.worker";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HealthCardPreviewProps {
  patient: Pick<
    Patient,
    | "id"
    | "patientCode"
    | "firstName"
    | "middleName"
    | "lastName"
    | "sex"
    | "birthDate"
    | "age"
  >;
  card: HealthCardData;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HealthCardPreview({
  patient,
  card,
}: HealthCardPreviewProps) {
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  // Worker-based QR generator (off main thread for performance).
  const qrWorker = useWebWorker<QrGeneratorApi>(
    new URL("../../workers/qrGenerator.worker.ts", import.meta.url)
  );

  useEffect(() => {
    let cancelled = false;

    async function buildQr() {
      // Build the signed URL from patient_id + card_version.
      // Signature computation happens server-side; the client just encodes
      // the URL that the backend already signed.
      const verifyUrl =
        `https://smarthealthhub.local/verify` +
        `?pid=${encodeURIComponent(patient.id)}` +
        `&v=${card.card_version}`;
      // Note: the sig param is not computed client-side.  The frontend
      // uses card.qr_data_uri (from generate/reissue response) when
      // available; otherwise it generates a preview without the sig —
      // the server will reject it, which is correct behaviour.

      try {
        let uri: string;
        if (qrWorker) {
          uri = await qrWorker.generateDataUri(verifyUrl);
        } else {
          // Synchronous fallback — Worker unavailable.
          uri = await generateQrDataUri(verifyUrl);
        }
        if (!cancelled) setQrDataUri(uri);
      } catch {
        if (!cancelled) setQrError(true);
      }
    }

    // Prefer the server-generated QR data URI (contains HMAC sig).
    if (card.qr_data_uri) {
      setQrDataUri(card.qr_data_uri);
    } else {
      void buildQr();
    }

    return () => {
      cancelled = true;
    };
  }, [patient.id, card.card_version, card.qr_data_uri, qrWorker]);

  // Format birth date for display.
  const birthYear = patient.birthDate ? patient.birthDate.slice(0, 4) : "";
  const middleInitial =
    patient.middleName ? ` ${patient.middleName[0]}.` : "";
  const displayName = `${patient.lastName}, ${patient.firstName}${middleInitial}`;
  const issuedDate = card.issued_at
    ? new Date(card.issued_at).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div
      style={{
        // CR80 card proportions rendered at 3× scale (256.8mm → ~972px wide)
        // so it looks good on screen while matching print dimensions.
        width: "342px",
        height: "216px",
        borderRadius: "8px",
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        fontFamily: "'Arial', sans-serif",
        display: "flex",
        flexDirection: "column",
        border: "1px solid #e2e8f0",
        backgroundColor: "#ffffff",
      }}
      aria-label={`Health card preview for ${displayName}`}
    >
      {/* ── Header strip ──────────────────────────────────────────────── */}
      <div
        style={{
          background: "#0d9488",
          color: "#ffffff",
          height: "36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
        }}
      >
        <span style={{ fontSize: "9px", fontWeight: "bold", letterSpacing: "0.5px" }}>
          SMARTHEALTH HUB
        </span>
        <span style={{ fontSize: "7.5px", opacity: 0.9 }}>
          Barangay Health Center
        </span>
      </div>

      {/* ── Body: patient info + QR code ──────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          padding: "8px 12px",
          gap: "8px",
          backgroundColor: "#f0fdfa",
        }}
      >
        {/* Left: patient details */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "3px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: "bold",
              color: "#0f172a",
              lineHeight: 1.2,
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: "9px",
              color: "#0d9488",
              fontWeight: "bold",
              letterSpacing: "0.8px",
            }}
          >
            {patient.patientCode}
          </div>
          <div style={{ fontSize: "7.5px", color: "#64748b", marginTop: "2px" }}>
            {patient.sex === "male" ? "Male" : "Female"} · Born {birthYear}
          </div>
          <div style={{ marginTop: "4px" }}>
            <div style={{ fontSize: "7px", color: "#94a3b8", textTransform: "uppercase" }}>
              Card No.
            </div>
            <div
              style={{
                fontSize: "7.5px",
                color: "#64748b",
                fontFamily: "monospace",
              }}
            >
              {card.card_number}
            </div>
          </div>
        </div>

        {/* Right: QR code */}
        <div
          style={{
            width: "80px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {qrDataUri ? (
            <img
              src={qrDataUri}
              alt="QR code — scan to verify patient identity"
              style={{ width: "72px", height: "72px" }}
            />
          ) : qrError ? (
            <div
              style={{
                width: "72px",
                height: "72px",
                border: "1px dashed #94a3b8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "7px",
                color: "#94a3b8",
                textAlign: "center",
              }}
            >
              QR unavailable
            </div>
          ) : (
            <div
              style={{
                width: "72px",
                height: "72px",
                border: "1px dashed #0d9488",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Loading QR code..."
              role="status"
            >
              <span style={{ fontSize: "7px", color: "#0d9488" }}>
                Generating...
              </span>
            </div>
          )}
          <div style={{ fontSize: "6px", color: "#94a3b8", marginTop: "3px" }}>
            Scan to verify
          </div>
        </div>
      </div>

      {/* ── Footer strip ──────────────────────────────────────────────── */}
      <div
        style={{
          background: "#0d9488",
          color: "rgba(255,255,255,0.85)",
          height: "28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          fontSize: "7px",
        }}
      >
        <span style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
          For Official Use Only
        </span>
        <span style={{ opacity: 0.8 }}>
          Issued: {issuedDate} · v{card.card_version}
        </span>
      </div>
    </div>
  );
}
