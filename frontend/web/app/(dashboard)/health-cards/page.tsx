import type { Metadata } from "next";

export const metadata: Metadata = { title: "Health Cards" };

/**
 * Health cards management page — generate, print, and manage hybrid NFC/QR health cards.
 * Cards encode only the patient_id + card_version + HMAC signature (no PHI).
 * Full implementation in Phase 3 (Health Cards).
 */
export default function HealthCardsPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Health Cards</h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Generate and manage patient health cards (NFC + QR code)
      </p>
      {/* TODO: Implement HealthCardList and generation workflow in Phase 3 */}
      <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
        Health card management — coming in Phase 3
      </p>
    </div>
  );
}
