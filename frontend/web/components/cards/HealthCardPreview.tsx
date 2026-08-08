"use client";

/**
 * HealthCardPreview — CR80 health card front & back visual preview.
 *
 * Uses NFC-FRONT-DESIGN.svg / NFC-BACKDESIGN.svg (public/) as full-bleed
 * backgrounds, matching the WeasyPrint card_front.html / card_back.html
 * templates exactly. Toggle buttons switch between faces with a CSS 3-D flip.
 *
 * Security invariant: QR encodes only patient_id + card_version + HMAC sig.
 * No PHI appears in the QR payload. Photo URL is constructed client-side from
 * the API host so the chip/QR never carry medical data.
 */

import { useEffect, useState } from "react";
import type { HealthCardData } from "@/types/healthCard";
import type { Patient } from "@/types/patient";
import { generateQrDataUri } from "@/lib/qr";

// ---------------------------------------------------------------------------
// Layout constants — CR80 card (85.6 mm × 54 mm) at display scale
// ---------------------------------------------------------------------------

const CARD_W = 456;
const CARD_H = Math.round(54 * (CARD_W / 85.6)); // 288 px
const PX_PER_MM = CARD_W / 85.6; // ≈ 5.327 px / mm

/** mm → px (integer) */
const mm = (v: number): number => Math.round(v * PX_PER_MM);

/** pt → px  (1 pt = 0.3528 mm) */
const pt = (v: number): number => Math.round(v * 0.3528 * PX_PER_MM);

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
    | "address"
    | "barangay"
    | "municipality"
    | "province"
    | "sitioPurok"
    | "bloodType"
    | "allergies"
    | "heightCm"
    | "weightKg"
    | "guardianName"
    | "guardianContact"
    | "emergencyContactName"
    | "emergencyContactNumber"
    | "isSenior"
    | "isPwd"
    | "isPregnant"
    | "mobileNumber"
    | "philhealthNo"
    | "philhealthMemberType"
    | "photoPath"
    | "knownConditions"
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
  const [side, setSide] = useState<"front" | "back">("front");
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  // Build QR — prefer the server-generated URI (contains HMAC sig)
  useEffect(() => {
    let cancelled = false;
    async function buildQr() {
      const url =
        `https://smarthealthhub.local/verify` +
        `?pid=${encodeURIComponent(patient.id)}&v=${card.card_version}`;
      try {
        const uri = await generateQrDataUri(url);
        if (!cancelled) setQrDataUri(uri);
      } catch {
        if (!cancelled) setQrError(true);
      }
    }
    if (card.qr_data_uri) {
      setQrDataUri(card.qr_data_uri);
    } else {
      void buildQr();
    }
    return () => {
      cancelled = true;
    };
  }, [patient.id, card.card_version, card.qr_data_uri]);

  // Derived display values
  const middleInitial = patient.middleName ? ` ${patient.middleName[0]}.` : "";
  const displayName = `${patient.lastName.toUpperCase()}, ${patient.firstName}${middleInitial}`;

  const birthDateDisplay = patient.birthDate
    ? new Date(patient.birthDate).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  const issuedDate = card.issued_at
    ? new Date(card.issued_at).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  const addressDisplay = (() => {
    const parts = [
      patient.sitioPurok,
      patient.barangay,
      patient.municipality,
      patient.province,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : patient.address || "—";
  })();

  const hasAllergies =
    !!patient.allergies &&
    patient.allergies !== "None on record" &&
    patient.allergies !== "None" &&
    patient.allergies !== "—";

  const emergencyName =
    patient.emergencyContactName ?? patient.guardianName ?? null;
  const emergencyNumber =
    patient.emergencyContactNumber ?? patient.guardianContact ?? null;

  const apiHost = (
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
  ).replace(/\/api\/v1\/?$/, "");
  const photoUrl = patient.photoPath ? `${apiHost}${patient.photoPath}` : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        fontFamily: "'Helvetica Neue', Arial, Helvetica, sans-serif",
      }}
    >
      {/* ── 3-D flip container ─────────────────────────────────────────── */}
      <div style={{ perspective: 1200 }}>
        <div
          style={{
            width: CARD_W,
            height: CARD_H,
            position: "relative",
            transformStyle: "preserve-3d",
            transition: "transform 0.55s cubic-bezier(0.4,0,0.2,1)",
            transform:
              side === "back" ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* ═══════════════════════════════════════════════════════════
              FRONT FACE
          ═══════════════════════════════════════════════════════════ */}
          <div style={faceBase}>
            {/* Full-bleed SVG background — no other background applied */}
            <img
              src="/card-bg-front.svg"
              alt=""
              aria-hidden
              style={bgImgStyle}
            />

            {/* BHC Seal — top-left */}
            <img
              src="/BHCFINALLOGO.svg"
              alt="BHC Seal"
              style={{
                position: "absolute",
                top: mm(2),
                left: mm(2),
                width: mm(16),
                height: mm(16),
                zIndex: 2,
                display: "block",
              }}
            />

            {/* Patient photo — white-backed card, left center */}
            <div
              style={{
                position: "absolute",
                top: mm(19),
                left: mm(3),
                zIndex: 2,
                background: "rgba(255,255,255,0.92)",
                borderRadius: 6,
                padding: mm(1),
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: mm(0.5),
              }}
            >
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Patient Photo"
                  style={{
                    width: mm(14),
                    height: mm(16),
                    objectFit: "cover",
                    borderRadius: 5,
                    border: "0.5px solid #cbd5e1",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: mm(14),
                    height: mm(16),
                    background: "#f1f5f9",
                    border: "1px dashed #94a3b8",
                    borderRadius: 5,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: mm(0.8),
                  }}
                >
                  <svg
                    width={mm(3.5)}
                    height={mm(3.5)}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span
                    style={{
                      fontSize: pt(3.8),
                      fontWeight: "bold",
                      color: "#94a3b8",
                      letterSpacing: "0.04em",
                    }}
                  >
                    PHOTO
                  </span>
                </div>
              )}
              <div
                style={{
                  fontSize: pt(3.2),
                  fontFamily: "monospace",
                  color: "#475569",
                  fontWeight: 600,
                  lineHeight: 1,
                  textAlign: "center",
                  maxWidth: mm(14),
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {card.card_number}
              </div>
            </div>

            {/* Patient info table — center */}
            <div
              style={{
                position: "absolute",
                top: mm(19),
                left: mm(21),
                right: mm(22),
                zIndex: 2,
                display: "flex",
                flexDirection: "column",
                gap: mm(1.2),
              }}
            >
              {(
                [
                  ["FULLNAME:", displayName],
                  ["PATIENTCODE:", patient.patientCode],
                  [
                    "AGE & GENDER:",
                    `${patient.age} / ${patient.sex.toUpperCase()}`,
                  ],
                  ["DATE OF BIRTH:", birthDateDisplay],
                  ["CONTACT:", patient.mobileNumber ?? "—"],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: mm(1.5),
                  }}
                >
                  <span
                    style={{
                      fontSize: pt(5.5),
                      fontWeight: 800,
                      color: "#1e293b",
                      textTransform: "uppercase",
                      letterSpacing: "0.01em",
                      flexShrink: 0,
                      minWidth: mm(17),
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: pt(5.5),
                      fontWeight: 500,
                      color: "#0f172a",
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* PhilHealth — white-backed pill, bottom-left */}
            <div
              style={{
                position: "absolute",
                bottom: mm(7),
                left: mm(3),
                zIndex: 2,
                background: "rgba(255,255,255,0.90)",
                borderRadius: 5,
                padding: `${mm(0.6)}px ${mm(1.2)}px`,
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: mm(1.2),
              }}
            >
              <img
                src="/philhealth-logo.svg"
                alt="PhilHealth"
                style={{
                  width: mm(3.5),
                  height: mm(5.5),
                  objectFit: "contain",
                  flexShrink: 0,
                  display: "block",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: pt(4),
                    fontWeight: 800,
                    color: "#065f46",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                    lineHeight: 1,
                  }}
                >
                  PhilHealth
                </span>
                <span
                  style={{
                    fontSize: pt(4.5),
                    fontWeight: 700,
                    color: "#1e293b",
                    fontFamily: "monospace",
                    lineHeight: 1.2,
                    display: "flex",
                    alignItems: "center",
                    gap: mm(0.8),
                  }}
                >
                  {patient.philhealthNo ?? "—"}
                  {patient.philhealthMemberType && (
                    <span
                      style={{
                        fontSize: pt(3),
                        fontWeight: "bold",
                        color: "#ffffff",
                        background: "#059669",
                        padding: `1px ${mm(0.8)}px`,
                        borderRadius: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      {patient.philhealthMemberType}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* QR code — bottom-right */}
            <div
              style={{
                position: "absolute",
                bottom: mm(2),
                right: mm(2),
                zIndex: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: mm(0.5),
              }}
            >
              {qrDataUri ? (
                <img
                  src={qrDataUri}
                  alt="QR code — scan to verify"
                  style={{
                    width: mm(17),
                    height: mm(17),
                    background: "#ffffff",
                    padding: mm(0.4),
                    borderRadius: 1.5,
                    border: "0.4px solid #e2e8f0",
                    display: "block",
                  }}
                />
              ) : qrError ? (
                <div
                  style={{
                    width: mm(17),
                    height: mm(17),
                    border: "1px dashed #94a3b8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: pt(3.5),
                    color: "#94a3b8",
                    textAlign: "center",
                    background: "rgba(255,255,255,0.8)",
                    borderRadius: 1.5,
                  }}
                >
                  QR unavailable
                </div>
              ) : (
                <div
                  style={{
                    width: mm(17),
                    height: mm(17),
                    border: "1px dashed #0d9488",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255,255,255,0.8)",
                    borderRadius: 1.5,
                  }}
                  aria-label="Loading QR code…"
                  role="status"
                >
                  <span style={{ fontSize: pt(3.5), color: "#0d9488" }}>
                    Generating…
                  </span>
                </div>
              )}
              <div
                style={{
                  fontSize: pt(4),
                  color: "#334155",
                  textAlign: "center",
                  fontWeight: 500,
                }}
              >
                Scan to verify
              </div>
            </div>

            {/* Footer — bottom-left */}
            <div
              style={{
                position: "absolute",
                bottom: mm(1.5),
                left: mm(3),
                zIndex: 2,
                display: "flex",
                flexDirection: "column",
                gap: mm(0.3),
              }}
            >
              <span style={{ fontSize: pt(3.8), color: "#64748b" }}>
                Issued: {issuedDate}
              </span>
              <span
                style={{
                  fontSize: pt(3.8),
                  color: "#475569",
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                }}
              >
                CARD: V{card.card_version}
              </span>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════
              BACK FACE
          ═══════════════════════════════════════════════════════════ */}
          <div style={{ ...faceBase, transform: "rotateY(180deg)" }}>
            {/* Full-bleed SVG background */}
            <img
              src="/card-bg-back.svg"
              alt=""
              aria-hidden
              style={bgImgStyle}
            />

            {/* ── Header bar: logo + title stack + optional photo ─────── */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: mm(13),
                zIndex: 2,
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                padding: `0 ${mm(2)}px`,
                gap: mm(1.5),
              }}
            >
              <img
                src="/BHCFINALLOGO.svg"
                alt="BHC Seal"
                style={{
                  width: mm(9),
                  height: mm(9),
                  flexShrink: 0,
                  display: "block",
                }}
              />

              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: mm(0.5),
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: pt(5),
                    fontWeight: 800,
                    color: "#0f172a",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    background: "rgba(255,255,255,0.85)",
                    padding: `${mm(0.3)}px ${mm(0.8)}px`,
                    borderRadius: 3,
                    display: "inline-block",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  Medical Summary
                </span>
                <span
                  style={{
                    fontSize: pt(3.8),
                    fontWeight: 600,
                    color: "#334155",
                    background: "rgba(255,255,255,0.70)",
                    padding: `${mm(0.2)}px ${mm(0.8)}px`,
                    borderRadius: 2,
                    display: "inline-block",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  Emergency &amp; Health Information
                </span>
              </div>

              {photoUrl && (
                <img
                  src={photoUrl}
                  alt=""
                  style={{
                    width: mm(8),
                    height: mm(8),
                    objectFit: "cover",
                    borderRadius: "50%",
                    border: `1.5px solid rgba(255,255,255,0.70)`,
                    flexShrink: 0,
                  }}
                />
              )}
            </div>

            {/* ── Main data panel ─────────────────────────────────────── */}
            <div
              style={{
                position: "absolute",
                top: mm(13),
                left: mm(2),
                right: mm(2),
                bottom: mm(8),
                zIndex: 2,
                background: "rgba(255,255,255,0.90)",
                borderRadius: 3,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Address */}
              <div style={bpRow}>
                <span style={bpLabel}>Address</span>
                <span
                  style={{
                    ...bpValue,
                    fontSize: pt(5),
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {addressDisplay}
                </span>
              </div>

              {/* Blood type + Allergies */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "stretch",
                  borderBottom: "0.5px solid rgba(203,213,225,0.7)",
                  flexShrink: 0,
                }}
              >
                {/* Blood type column */}
                <div
                  style={{
                    flexShrink: 0,
                    width: mm(15),
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: `${mm(0.5)}px ${mm(1)}px`,
                    borderRight: "0.5px solid rgba(203,213,225,0.7)",
                    gap: mm(0.3),
                  }}
                >
                  <span
                    style={{
                      fontSize: pt(3.5),
                      fontWeight: 800,
                      color: "#0d7c6e",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Blood Type
                  </span>
                  <span
                    style={{
                      fontSize: pt(10),
                      fontWeight: 900,
                      color: "#0f172a",
                      lineHeight: 1,
                    }}
                  >
                    {patient.bloodType ?? "—"}
                  </span>
                </div>

                {/* Allergies column */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    padding: `${mm(0.5)}px ${mm(1.2)}px`,
                    ...(hasAllergies
                      ? {
                          background: "rgba(254,242,242,0.95)",
                          borderLeft: `2px solid #dc2626`,
                        }
                      : {}),
                  }}
                >
                  <span
                    style={{
                      ...bpLabel,
                      color: hasAllergies ? "#b91c1c" : "#0d7c6e",
                    }}
                  >
                    Allergies / Alerts
                  </span>
                  <span
                    style={{
                      ...bpValue,
                      color: hasAllergies ? "#991b1b" : "#334155",
                      fontWeight: hasAllergies ? 700 : 500,
                      fontSize: pt(5),
                    }}
                  >
                    {patient.allergies ?? "None on record"}
                  </span>
                </div>
              </div>

              {/* Vitals */}
              <div
                style={{
                  ...bpRow,
                  alignItems: "center",
                  gap: mm(2),
                }}
              >
                <span style={bpLabel}>Vitals</span>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    gap: mm(4),
                    flex: 1,
                  }}
                >
                  {(
                    [
                      ["Wt", patient.weightKg ? `${patient.weightKg} kg` : "—"],
                      ["Ht", patient.heightCm ? `${patient.heightCm} cm` : "—"],
                    ] as [string, string][]
                  ).map(([lbl, val]) => (
                    <div
                      key={lbl}
                      style={{ display: "flex", flexDirection: "column", gap: 1 }}
                    >
                      <span
                        style={{
                          fontSize: pt(3.5),
                          fontWeight: 700,
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {lbl}
                      </span>
                      <span
                        style={{
                          fontSize: pt(6),
                          fontWeight: 700,
                          color: "#0f172a",
                          lineHeight: 1,
                        }}
                      >
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Clinical notes */}
              <div
                style={{
                  ...bpRow,
                  alignItems: "flex-start",
                  flex: 1,
                  borderBottom: "none",
                }}
              >
                <span style={bpLabel}>Notes</span>
                <span
                  style={{
                    fontSize: pt(5),
                    color: "#475569",
                    fontStyle: "italic",
                    lineHeight: 1.35,
                  }}
                >
                  {patient.knownConditions ?? "No additional notes."}
                </span>
              </div>

              {/* Emergency contact */}
              {emergencyName && (
                <div
                  style={{
                    ...bpRow,
                    background: "rgba(240,253,244,0.95)",
                    borderTop: "0.5px solid rgba(209,250,229,0.9)",
                  }}
                >
                  <span style={{ ...bpLabel, color: "#065f46" }}>
                    Emergency
                  </span>
                  <span
                    style={{
                      ...bpValue,
                      fontWeight: 700,
                      color: "#064e3b",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {emergencyName}
                    {emergencyNumber ? ` · ${emergencyNumber}` : ""}
                  </span>
                </div>
              )}

              {/* Priority flags */}
              {(patient.isSenior || patient.isPwd || patient.isPregnant) && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    gap: mm(1),
                    padding: `${mm(0.6)}px ${mm(2)}px`,
                    flexShrink: 0,
                    borderTop: "0.5px solid rgba(203,213,225,0.6)",
                  }}
                >
                  {patient.isSenior && (
                    <span
                      style={{
                        ...flagBadge,
                        background: "#fef9c3",
                        color: "#854d0e",
                        border: "0.5px solid #fde047",
                      }}
                    >
                      Senior Citizen
                    </span>
                  )}
                  {patient.isPwd && (
                    <span
                      style={{
                        ...flagBadge,
                        background: "#dbeafe",
                        color: "#1e3a8a",
                        border: "0.5px solid #93c5fd",
                      }}
                    >
                      PWD
                    </span>
                  )}
                  {patient.isPregnant && (
                    <span
                      style={{
                        ...flagBadge,
                        background: "#fce7f3",
                        color: "#9d174d",
                        border: "0.5px solid #f9a8d4",
                      }}
                    >
                      Pregnant
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ── Back footer ──────────────────────────────────────────── */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: mm(7),
                zIndex: 2,
                background: "rgba(8,92,81,0.88)",
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: `0 ${mm(2.5)}px`,
              }}
            >
              <span
                style={{
                  fontSize: pt(4),
                  color: "#ccfbf1",
                  lineHeight: 1.2,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Property of {patient.barangay ?? "Barangay Health Center"} —
                please return if found.
              </span>
              <span
                style={{
                  fontSize: pt(3.5),
                  color: "rgba(204,251,241,0.60)",
                  letterSpacing: "0.01em",
                  flexShrink: 0,
                  marginLeft: mm(2),
                }}
              >
                SmartHealth Hub
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Front / Back toggle ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["front", "back"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            style={{
              padding: "6px 20px",
              borderRadius: 6,
              border: `1px solid ${side === s ? "#0d9488" : "#e2e8f0"}`,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              background: side === s ? "#0d9488" : "#ffffff",
              color: side === s ? "#ffffff" : "#64748b",
              transition: "all 0.15s",
            }}
          >
            {s === "front" ? "Front" : "Back"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module-level style fragments (evaluated once at load)
// ---------------------------------------------------------------------------

const faceBase: React.CSSProperties = {
  position: "absolute",
  width: "100%",
  height: "100%",
  borderRadius: 8,
  overflow: "hidden",
  backfaceVisibility: "hidden",
};

const bgImgStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  display: "block",
};

const bpRow: React.CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "baseline",
  padding: `${mm(0.8)}px ${mm(2)}px`,
  borderBottom: "0.5px solid rgba(203,213,225,0.7)",
  gap: mm(2),
  flexShrink: 0,
};

const bpLabel: React.CSSProperties = {
  fontSize: pt(4.5),
  fontWeight: 800,
  color: "#0d7c6e",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  flexShrink: 0,
  minWidth: mm(13),
};

const bpValue: React.CSSProperties = {
  fontSize: pt(5.5),
  fontWeight: 500,
  color: "#1e293b",
  lineHeight: 1.25,
};

const flagBadge: React.CSSProperties = {
  fontSize: pt(4),
  fontWeight: 700,
  padding: `${mm(0.4)}px ${mm(1.5)}px`,
  borderRadius: 3,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
};
