"use client";

/**
 * HealthCardPreview — CR80 health card front & back visual preview.
 * Mirrors card_front.html / card_back.html + card_styles.css exactly.
 *
 * Front: BHC seal · 15×17mm photo · 5-row info · PhilHealth + badges · QR
 * Back:  Full medical summary — address · blood type + allergies · vitals ·
 *        emergency · PhilHealth · flags. Dark red/rose (#8b1a1a) theme.
 *
 * No NFC icons on either face.
 * Security invariant: QR encodes only patient_id + card_version + HMAC.
 */

import { useEffect, useState } from "react";
import type { HealthCardData } from "@/types/healthCard";
import type { Patient } from "@/types/patient";
import { generateQrDataUri } from "@/lib/qr";

// ---------------------------------------------------------------------------
// Layout constants — CR80 (85.6 × 54 mm) at display scale
// ---------------------------------------------------------------------------

const CARD_W = 456;
const CARD_H = Math.round(54 * (CARD_W / 85.6));
const PX_PER_MM = CARD_W / 85.6;

const mm = (v: number) => Math.round(v * PX_PER_MM);
const pt = (v: number) => Math.round(v * 0.3528 * PX_PER_MM);

const RED = "#8b1a1a";
const RED_BORDER = "rgba(139,26,26,0.15)";
const RED_BG = "rgba(139,26,26,0.04)";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HealthCardPreviewProps {
  patient: Pick<
    Patient,
    | "id" | "patientCode" | "firstName" | "middleName" | "lastName"
    | "sex" | "birthDate" | "age"
    | "address" | "barangay" | "municipality" | "province" | "sitioPurok"
    | "bloodType" | "allergies" | "heightCm" | "weightKg"
    | "guardianName" | "guardianContact"
    | "emergencyContactName" | "emergencyContactNumber"
    | "isSenior" | "isPwd" | "isPregnant"
    | "mobileNumber" | "philhealthNo" | "philhealthMemberType"
    | "photoPath" | "knownConditions"
  >;
  card: HealthCardData;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HealthCardPreview({ patient, card }: HealthCardPreviewProps) {
  const [side, setSide] = useState<"front" | "back">("front");
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function buildQr() {
      const url = `https://smarthealthhub.local/verify?pid=${encodeURIComponent(patient.id)}&v=${card.card_version}`;
      try {
        const uri = await generateQrDataUri(url);
        if (!cancelled) setQrDataUri(uri);
      } catch { if (!cancelled) setQrError(true); }
    }
    if (card.qr_data_uri) setQrDataUri(card.qr_data_uri);
    else void buildQr();
    return () => { cancelled = true; };
  }, [patient.id, card.card_version, card.qr_data_uri]);

  // Derived
  const fullName = [patient.firstName, patient.middleName, patient.lastName]
    .filter(Boolean).join(" ").toUpperCase();

  const dob = patient.birthDate
    ? new Date(patient.birthDate).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  const issuedDate = card.issued_at
    ? new Date(card.issued_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
    : "";

  const addressDisplay = (() => {
    const p = [patient.sitioPurok, patient.barangay, patient.municipality, patient.province].filter(Boolean);
    return p.length ? p.join(", ") : (patient.address || "—");
  })();

  const hasAllergies = !!patient.allergies &&
    !["None on record", "None", "—"].includes(patient.allergies ?? "");

  const ecName = (patient.emergencyContactName && patient.emergencyContactName !== "—")
    ? patient.emergencyContactName : (patient.guardianName ?? null);
  const ecNum = (patient.emergencyContactNumber && patient.emergencyContactNumber !== "—")
    ? patient.emergencyContactNumber : (patient.guardianContact ?? null);

  const philhealthPresent = !!patient.philhealthNo && patient.philhealthNo !== "—";
  const is4ps = patient.philhealthMemberType?.toLowerCase() === "4ps";
  const hasBadges = is4ps || patient.isPwd || patient.isSenior || patient.isPregnant;

  const apiHost = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/api\/v1\/?$/, "");
  const photoUrl = patient.photoPath ? `${apiHost}${patient.photoPath}` : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      fontFamily: "'Helvetica Neue', Arial, Helvetica, sans-serif" }}>

      <div style={{ perspective: 1200 }}>
        <div style={{
          width: CARD_W, height: CARD_H, position: "relative",
          transformStyle: "preserve-3d",
          transition: "transform 0.55s cubic-bezier(0.4,0,0.2,1)",
          transform: side === "back" ? "rotateY(180deg)" : "rotateY(0deg)",
        }}>

          {/* ═══════════════════════════════════════════════════
              FRONT
          ═══════════════════════════════════════════════════ */}
          <div style={faceBase}>
            <img src="/card-bg-front.svg" alt="" aria-hidden style={bgFull} />

            {/* BHC Seal — top:2.5mm left:2.5mm 15mm */}
            <img src="/BHCFINALLOGO.svg" alt="BHC Seal" style={{
              position: "absolute", top: mm(2.5), left: mm(2.5),
              width: mm(15), height: mm(15), zIndex: 2,
            }} />

            {/* Photo — top:21mm left:14mm 15×17mm */}
            <div style={{ position: "absolute", top: mm(21), left: mm(14), width: mm(15), zIndex: 2 }}>
              {photoUrl ? (
                <img src={photoUrl} alt="Patient Photo" style={{
                  width: mm(15), height: mm(17), objectFit: "cover",
                  borderRadius: mm(1), border: "0.7px solid #5f6368", display: "block",
                }} />
              ) : (
                <div style={{
                  width: mm(15), height: mm(17), background: "rgba(226,232,240,0.90)",
                  border: "0.5px dashed #94a3b8", borderRadius: mm(1),
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: mm(0.8),
                }}>
                  <svg width={mm(4)} height={mm(4)} viewBox="0 0 24 24" fill="none"
                    stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span style={{ fontSize: pt(3.8), fontWeight: 700, color: "#64748b", letterSpacing: "0.03em" }}>
                    PHOTO
                  </span>
                </div>
              )}
            </div>

            {/* Info rows — top:21mm left:31mm right:3mm */}
            <div style={{
              position: "absolute", top: mm(21), left: mm(31), right: mm(3),
              zIndex: 2, display: "flex", flexDirection: "column", gap: mm(1.2),
            }}>
              {([
                ["FULLNAME:", fullName],
                ["PATIENTCODE:", patient.patientCode],
                ["AGE & GENDER:", `${patient.age} / ${patient.sex.toUpperCase()}`],
                ["DATE OF BIRTH:", dob],
                ["CONTACT:", patient.mobileNumber ?? "—"],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} style={{ display: "flex", alignItems: "baseline", gap: mm(2), whiteSpace: "nowrap" }}>
                  <span style={{
                    fontSize: pt(5.5), fontWeight: 700, color: "#111111",
                    textTransform: "uppercase", letterSpacing: "0.005em",
                    flexShrink: 0, minWidth: mm(13.5), lineHeight: 1.2,
                  }}>
                    {label}
                  </span>
                  <span style={{
                    fontSize: pt(5.5), fontWeight: 400, color: "#111111",
                    lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Beneficiary section — top:39.5mm left:14mm */}
            {(philhealthPresent || hasBadges) && (
              <div style={{
                position: "absolute", top: mm(39.5), left: mm(14), zIndex: 2,
                display: "flex", flexDirection: "column", gap: mm(1.2), maxWidth: mm(54),
              }}>
                {philhealthPresent && (
                  <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: mm(1.5) }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: mm(6.5), height: mm(6.5), background: "rgba(255,255,255,0.90)",
                      borderRadius: mm(1), border: "0.3px solid #d1d5db", flexShrink: 0,
                    }}>
                      <svg width={mm(3.5)} height={mm(3.5)} viewBox="0 0 28 28" fill="none">
                        <circle cx="8" cy="6" r="4.5" fill="#c8a200" />
                        <path d="M0 24 Q0 14 8 14 Q16 14 16 24Z" fill="#c8a200" />
                        <circle cx="20" cy="6" r="4.5" fill="#059669" />
                        <path d="M12 24 Q12 14 20 14 Q28 14 28 24Z" fill="#059669" />
                      </svg>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: pt(5.5), fontWeight: 700, color: "#111111", lineHeight: 1.15 }}>
                        PhilHealth
                      </span>
                      <span style={{
                        fontSize: pt(5), fontWeight: 500, color: "#111111",
                        fontFamily: "monospace", lineHeight: 1.15,
                        display: "flex", alignItems: "center", gap: mm(1),
                      }}>
                        {patient.philhealthNo}
                        {patient.philhealthMemberType && !is4ps && (
                          <span style={{
                            fontSize: pt(3.5), fontWeight: 800, color: "#fff",
                            background: "#059669", padding: `1px ${mm(1)}px`,
                            borderRadius: 1, textTransform: "uppercase",
                          }}>
                            {patient.philhealthMemberType}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
                {hasBadges && (
                  <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: mm(1) }}>
                    {is4ps && <span style={{ ...benBadge, background: "#0891b2" }}>4Ps</span>}
                    {patient.isPwd && <span style={{ ...benBadge, background: "#1d4ed8" }}>PWD</span>}
                    {patient.isSenior && <span style={{ ...benBadge, background: "#7c3aed" }}>Senior</span>}
                    {patient.isPregnant && <span style={{ ...benBadge, background: "#be185d" }}>Pregnant</span>}
                  </div>
                )}
              </div>
            )}

            {/* QR — bottom:2.5mm right:2.5mm 13mm */}
            <div style={{
              position: "absolute", bottom: mm(2.5), right: mm(2.5), zIndex: 2,
              display: "flex", flexDirection: "column", alignItems: "center", gap: mm(0.7),
            }}>
              {qrDataUri ? (
                <img src={qrDataUri} alt="QR" style={{
                  width: mm(13), height: mm(13), background: "#fff",
                  padding: mm(0.3), border: "0.3px solid #e2e8f0", display: "block",
                }} />
              ) : qrError ? (
                <div style={{ ...qrPlaceholderStyle }}>QR unavailable</div>
              ) : (
                <div style={{ ...qrPlaceholderStyle }} role="status">
                  <span style={{ fontSize: pt(3.5), color: "#94a3b8" }}>…</span>
                </div>
              )}
              <span style={{ fontSize: pt(3.8), color: "#111111", fontWeight: 400, lineHeight: 1 }}>
                Scan to verify
              </span>
            </div>

            {/* Footer — bottom:1.5mm left:2mm */}
            <div style={{
              position: "absolute", bottom: mm(1.5), left: mm(2), zIndex: 2,
              display: "flex", flexDirection: "column", gap: mm(0.4),
            }}>
              <span style={{ fontSize: pt(3.5), color: "rgba(255,255,255,0.80)", fontWeight: 400 }}>
                Issued: {issuedDate}
              </span>
              <span style={{ fontSize: pt(3.5), color: "rgba(255,255,255,0.80)", fontWeight: 600 }}>
                CARD: V{card.card_version}
              </span>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════
              BACK — comprehensive, dark red theme, no NFC icon
          ═══════════════════════════════════════════════════ */}
          <div style={{ ...faceBase, transform: "rotateY(180deg)" }}>
            <img src="/card-bg-back.svg" alt="" aria-hidden style={bgFull} />

            {/* BHC Logo */}
            <img src="/BHCFINALLOGO.svg" alt="BHC Seal" style={{
              position: "absolute", top: mm(1.5), left: mm(2),
              width: mm(9), height: mm(9), zIndex: 2,
            }} />

            {/* Header */}
            <div style={{
              position: "absolute", top: mm(2.5), left: mm(13), right: mm(3),
              zIndex: 2, display: "flex", flexDirection: "column",
            }}>
              <span style={{
                fontSize: pt(5), fontWeight: 800, color: RED,
                textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.2,
              }}>
                SmartHealth Hub
              </span>
              <span style={{
                fontSize: pt(4), fontWeight: 600, color: "#5a5a5a",
                fontFamily: "monospace", letterSpacing: "0.02em", lineHeight: 1.2,
              }}>
                {card.card_number} · V{card.card_version}
              </span>
            </div>

            {/* Main panel — right:22mm to expose SVG emblem */}
            <div style={{
              position: "absolute", top: mm(12), left: mm(2), right: mm(22), bottom: mm(8),
              zIndex: 2, background: "rgba(255,255,255,0.82)", borderRadius: 2,
              overflow: "hidden", display: "flex", flexDirection: "column",
            }}>

              {/* Address */}
              <div style={backRow}>
                <span style={backLabel}>Address</span>
                <span style={{
                  ...backValue, fontSize: pt(4.3),
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {addressDisplay}
                </span>
              </div>

              {/* Blood type + Allergies — two columns */}
              <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch",
                borderBottom: `0.3px solid ${RED_BORDER}`, flexShrink: 0 }}>
                {/* Blood type */}
                <div style={{
                  flexShrink: 0, width: mm(15),
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", padding: `${mm(0.5)}px ${mm(1.5)}px`,
                  borderRight: `0.3px solid ${RED_BORDER}`, gap: mm(0.2),
                }}>
                  <span style={{ fontSize: pt(3.8), fontWeight: 800, color: RED,
                    textTransform: "uppercase", letterSpacing: "0.02em" }}>
                    Blood Type
                  </span>
                  <span style={{ fontSize: pt(10), fontWeight: 900, color: RED, lineHeight: 1 }}>
                    {patient.bloodType ?? "—"}
                  </span>
                </div>
                {/* Allergies */}
                <div style={{
                  flex: 1, display: "flex", flexDirection: "column", justifyContent: "center",
                  padding: `${mm(0.5)}px ${mm(1.5)}px`,
                  ...(hasAllergies ? { background: "rgba(254,242,242,0.92)", borderLeft: "2px solid #dc2626" } : {}),
                }}>
                  <span style={{
                    fontSize: pt(3.8), fontWeight: 800, textTransform: "uppercase",
                    letterSpacing: "0.02em", color: hasAllergies ? "#b91c1c" : RED,
                  }}>
                    Allergies / Alerts
                  </span>
                  <span style={{
                    fontSize: pt(4.8), fontWeight: hasAllergies ? 700 : 500,
                    color: hasAllergies ? "#991b1b" : "#1e293b", lineHeight: 1.2,
                  }}>
                    {patient.allergies ?? "None on record"}
                  </span>
                </div>
              </div>

              {/* Vitals */}
              <div style={{ ...backRow, alignItems: "center", gap: mm(1.5) }}>
                <span style={backLabel}>Last Vitals</span>
                <div style={{ display: "flex", flexDirection: "row", gap: mm(3.5), flex: 1 }}>
                  {([
                    ["Weight", patient.weightKg ? `${patient.weightKg} kg` : "—"],
                    ["Height", patient.heightCm ? `${patient.heightCm} cm` : "—"],
                  ] as [string, string][]).map(([lbl, val]) => (
                    <div key={lbl} style={{ display: "flex", flexDirection: "column", gap: mm(0.2) }}>
                      <span style={{ fontSize: pt(3.2), fontWeight: 800, color: RED,
                        textTransform: "uppercase", letterSpacing: "0.02em" }}>
                        {lbl}
                      </span>
                      <span style={{ fontSize: pt(5), fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Emergency contact */}
              {ecName && (
                <div style={{ ...backRow, background: RED_BG }}>
                  <span style={backLabel}>Emergency</span>
                  <span style={{
                    ...backValue, fontWeight: 700, color: "#1e293b",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {ecName}{ecNum ? ` · ${ecNum}` : ""}
                  </span>
                </div>
              )}

              {/* PhilHealth */}
              {philhealthPresent && (
                <div style={backRow}>
                  <span style={backLabel}>PhilHealth</span>
                  <span style={{ ...backValue, fontFamily: "monospace", fontSize: pt(4.5),
                    display: "flex", alignItems: "center", gap: mm(1) }}>
                    {patient.philhealthNo}
                    {patient.philhealthMemberType && (
                      <span style={{
                        fontSize: pt(3.2), fontWeight: 800, color: "#fff",
                        background: "#059669", padding: `1px ${mm(1)}px`,
                        borderRadius: 1, textTransform: "uppercase",
                      }}>
                        {patient.philhealthMemberType}
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Priority flags */}
              {(patient.isSenior || patient.isPwd || patient.isPregnant) && (
                <div style={{
                  display: "flex", flexDirection: "row", gap: mm(1),
                  padding: `${mm(0.5)}px ${mm(2)}px`, flexShrink: 0,
                }}>
                  {patient.isSenior && (
                    <span style={{ ...backFlag, background: "rgba(139,26,26,0.10)",
                      color: RED, border: "0.3px solid rgba(139,26,26,0.35)" }}>
                      Senior Citizen
                    </span>
                  )}
                  {patient.isPwd && (
                    <span style={{ ...backFlag, background: "rgba(29,78,216,0.08)",
                      color: "#1d4ed8", border: "0.3px solid rgba(29,78,216,0.30)" }}>
                      PWD
                    </span>
                  )}
                  {patient.isPregnant && (
                    <span style={{ ...backFlag, background: "rgba(190,24,93,0.08)",
                      color: "#be185d", border: "0.3px solid rgba(190,24,93,0.30)" }}>
                      Pregnant
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Footer — dark red bar */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, height: mm(7), zIndex: 2,
              background: "rgba(139,26,26,0.84)",
              display: "flex", flexDirection: "column", alignItems: "flex-start",
              justifyContent: "center", padding: `0 ${mm(3)}px`,
            }}>
              <span style={{ fontSize: pt(3.8), color: "rgba(255,235,235,0.95)",
                lineHeight: 1.2, fontWeight: 400 }}>
                Property of {patient.barangay ?? "Barangay Health Center"}. If found, return to nearest BHC.
              </span>
              <span style={{ fontSize: pt(3.2), color: "rgba(255,220,220,0.65)",
                marginTop: mm(0.3), letterSpacing: "0.01em", fontFamily: "monospace" }}>
                SmartHealth Hub · Thesis 2026 · {card.card_number}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Toggle */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["front", "back"] as const).map((s) => (
          <button key={s} onClick={() => setSide(s)} style={{
            padding: "6px 20px", borderRadius: 6,
            border: `1px solid ${side === s ? RED : "#e2e8f0"}`,
            cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: side === s ? RED : "#ffffff",
            color: side === s ? "#ffffff" : "#64748b",
            transition: "all 0.15s",
          }}>
            {s === "front" ? "Front" : "Back"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const faceBase: React.CSSProperties = {
  position: "absolute", width: "100%", height: "100%",
  borderRadius: 8, overflow: "hidden", backfaceVisibility: "hidden",
};

const bgFull: React.CSSProperties = {
  position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "block",
};

const qrPlaceholderStyle: React.CSSProperties = {
  width: mm(13), height: mm(13),
  border: "1px dashed #94a3b8", display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: pt(3.5), color: "#94a3b8",
  textAlign: "center", background: "rgba(255,255,255,0.8)", borderRadius: 1,
};

const benBadge: React.CSSProperties = {
  fontSize: pt(3.8), fontWeight: 800, padding: `${mm(0.4)}px ${mm(1.3)}px`,
  borderRadius: 1.5, textTransform: "uppercase", letterSpacing: "0.015em", color: "#ffffff",
};

const backRow: React.CSSProperties = {
  display: "flex", flexDirection: "row", alignItems: "baseline",
  padding: `${mm(0.6)}px ${mm(2)}px`,
  borderBottom: `0.3px solid rgba(139,26,26,0.12)`,
  gap: mm(1.5), flexShrink: 0,
};

const backLabel: React.CSSProperties = {
  fontSize: pt(3.8), fontWeight: 800, color: "#8b1a1a",
  textTransform: "uppercase", letterSpacing: "0.02em",
  flexShrink: 0, minWidth: mm(13),
};

const backValue: React.CSSProperties = {
  fontSize: pt(4.8), fontWeight: 500, color: "#1e293b", lineHeight: 1.2,
};

const backFlag: React.CSSProperties = {
  fontSize: pt(3.5), fontWeight: 800, padding: `${mm(0.3)}px ${mm(1.2)}px`,
  borderRadius: 1.5, textTransform: "uppercase", letterSpacing: "0.015em",
};
