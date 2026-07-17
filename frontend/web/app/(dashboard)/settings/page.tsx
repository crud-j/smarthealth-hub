import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings page — system configuration for BHC name, SMS templates,
 * reminder lead times, and other configurable parameters.
 */
export default function SettingsPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Settings</h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        System configuration and preferences
      </p>
      {/* TODO: Implement settings panels in Phase 6 */}
      <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Settings — coming in Phase 6</p>
    </div>
  );
}
