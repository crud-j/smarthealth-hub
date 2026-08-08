"use client";

/**
 * Settings / Security page — all authenticated roles.
 *
 * Allows every user to register and revoke FIDO2/WebAuthn passkeys for their
 * own account. Once a passkey is registered, the user can sign in from the
 * login page without going through the SMS OTP flow.
 *
 * Uses inline styles to match the auth-page pattern — no Tailwind, no CSS modules.
 */

import { useEffect, useState } from "react";
import {
  listPasskeys,
  passkeyRegisterBegin,
  passkeyRegisterComplete,
  revokePasskey,
  type PasskeyCredentialInfo,
} from "../../../../lib/auth";
import { isPasskeySupported, startPasskeyRegistration } from "../../../../lib/passkey";
import { swSuccess, swError, swConfirm } from "@/lib/swal";

export default function SecurityPage() {
  const [passkeys, setPasskeys] = useState<PasskeyCredentialInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  // Start false so server/client initial render match; set after mount
  const [passkeySupported, setPasskeySupported] = useState(false);

  useEffect(() => {
    setPasskeySupported(isPasskeySupported());
  }, []);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  async function fetchPasskeys() {
    try {
      const { credentials } = await listPasskeys();
      setPasskeys(credentials);
    } catch {
      void swError("Failed to load passkeys.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchPasskeys();
  }, []);

  // ---------------------------------------------------------------------------
  // Register a new passkey
  // ---------------------------------------------------------------------------

  async function handleAddPasskey() {
    const deviceName = window.prompt(
      "Name this passkey (e.g. iPhone, Windows Hello):",
      "My Passkey"
    );
    // User cancelled the native browser prompt
    if (deviceName === null) return;

    const trimmedName = deviceName.trim() || "My Passkey";
    setIsRegistering(true);

    try {
      const { options } = await passkeyRegisterBegin(trimmedName);
      const attestation = await startPasskeyRegistration(options);
      await passkeyRegisterComplete(attestation, trimmedName);
      void swSuccess("Passkey added. You can now sign in with biometrics or your device PIN.");
      await fetchPasskeys();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        void swError("Passkey registration was cancelled.");
      } else {
        void swError("Registration failed. Please try again.");
      }
    } finally {
      setIsRegistering(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Revoke a passkey
  // ---------------------------------------------------------------------------

  async function handleRevoke(id: string, name: string) {
    const result = await swConfirm({
      title: "Remove passkey?",
      text: `Remove "${name}"? You will no longer be able to sign in with this passkey.`,
      confirmLabel: "Remove",
      isDangerous: true,
    });
    if (!result.isConfirmed) return;
    try {
      await revokePasskey(id);
      void swSuccess(`"${name}" has been removed.`);
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
    } catch {
      void swError("Failed to remove passkey. Please try again.");
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function formatDate(iso: string | null): string {
    if (!iso) return "Never";
    return new Date(iso).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const cardStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    border: "1px solid #e5d4cc",
    borderRadius: "1rem",
    padding: "1.5rem",
    marginBottom: "1.5rem",
    boxShadow: "0 2px 10px rgba(160,80,80,0.06)",
  };

  const headingStyle: React.CSSProperties = {
    fontSize: "1.125rem",
    fontWeight: 600,
    color: "#1a0808",
    marginBottom: "0.25rem",
    marginTop: 0,
    borderLeft: "3px solid #b5343e",
    paddingLeft: "0.75rem",
  };

  const subheadingStyle: React.CSSProperties = {
    fontSize: "0.875rem",
    color: "#9b6e6e",
    marginBottom: "1.25rem",
    marginTop: "0.25rem",
  };

  const addButtonStyle: React.CSSProperties = {
    padding: "0.5rem 1.25rem",
    background: isRegistering ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)",
    color: "#ffffff",
    border: "none",
    borderRadius: "0.5rem",
    fontSize: "0.875rem",
    fontWeight: 500,
    cursor: isRegistering ? "not-allowed" : "pointer",
    marginBottom: "1.25rem",
    transition: "background 0.15s ease",
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ maxWidth: "640px" }}>
      {/* Page heading */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1
          style={{
            fontSize: "1.375rem",
            fontFamily: "var(--font-dm-serif, Georgia, serif)",
            fontWeight: 400,
            color: "#1a0808",
            margin: 0,
          }}
        >
          Security
        </h1>
        <p
          style={{
            color: "#7a5252",
            fontSize: "0.875rem",
            marginTop: "0.375rem",
          }}
        >
          Manage your passkeys and sign-in security settings.
        </p>
      </div>

      {/* Passkeys card */}
      <div style={cardStyle}>
        <h2 style={headingStyle}>Passkeys</h2>
        <p style={subheadingStyle}>
          Sign in faster with your fingerprint, face scan, or device PIN —
          no OTP required.
        </p>

        {/* Browser not supported */}
        {!passkeySupported && (
          <div
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: "0.5rem",
              color: "#92400e",
              fontSize: "0.875rem",
              marginBottom: "1.25rem",
            }}
          >
            Passkeys require Chrome, Edge, or Safari. Your current browser is
            not supported.
          </div>
        )}

        {/* Add passkey button — hidden when WebAuthn is not available */}
        {passkeySupported && (
          <button
            type="button"
            onClick={() => void handleAddPasskey()}
            disabled={isRegistering}
            style={addButtonStyle}
          >
            {isRegistering ? "Registering…" : "+ Add Passkey"}
          </button>
        )}

        {/* Passkey list */}
        {isLoading ? (
          <p style={{ color: "#9b6e6e", fontSize: "0.875rem" }}>
            Loading passkeys…
          </p>
        ) : passkeys.length === 0 ? (
          <p
            style={{
              color: "#b09090",
              fontSize: "0.875rem",
              fontStyle: "italic",
            }}
          >
            No passkeys registered. Click &ldquo;Add Passkey&rdquo; to get
            started.
          </p>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            {passkeys.map((pk) => (
              <div
                key={pk.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.875rem 1rem",
                  backgroundColor: "#fdf5f0",
                  border: "1px solid #e5d4cc",
                  borderRadius: "0.5rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  {/* Key icon */}
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                  </svg>
                  <div>
                    <div
                      style={{
                        fontSize: "0.9375rem",
                        fontWeight: 500,
                        color: "#1a0808",
                      }}
                    >
                      {pk.device_name}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#9b6e6e" }}>
                      Added {formatDate(pk.created_at)}
                      {pk.last_used_at &&
                        ` · Last used ${formatDate(pk.last_used_at)}`}
                    </div>
                  </div>
                </div>

                {/* Revoke button */}
                <button
                  type="button"
                  onClick={() => void handleRevoke(pk.id, pk.device_name)}
                  style={{
                    padding: "0.375rem 0.875rem",
                    backgroundColor: "transparent",
                    color: "#dc2626",
                    border: "1px solid #fecaca",
                    borderRadius: "0.375rem",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
