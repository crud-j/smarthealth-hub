"use client";

/**
 * NfcScanButton — triggers NFC tag reading for health card verification.
 *
 * Calls lib/nfc.ts readNfcTag() on click.  Shows status progression:
 *   "Scan NFC Card" → "Reading..." → "Success" | "Error"
 *
 * Displays a clear "NFC not supported on this browser/device" message when
 * Web NFC is unavailable (Chrome-on-Android only) — never a crash or
 * uncaught error.  Per SDP §7.4.4 graceful degradation requirement.
 *
 * Props:
 *   onResult(payload) — called with the parsed NFC payload on a successful tap.
 *   disabled          — disables the button (e.g. while a previous request is in flight).
 */

import { useState } from "react";
import type { NfcPayload } from "@/types/healthCard";
import { checkNfcSupport, readNfcTag } from "@/lib/nfc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NfcScanButtonProps {
  onResult: (payload: NfcPayload) => void;
  disabled?: boolean;
}

type ScanStatus =
  | "idle"
  | "reading"
  | "success"
  | "error"
  | "unsupported";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NfcScanButton({
  onResult,
  disabled = false,
}: NfcScanButtonProps) {
  const nfcSupport = checkNfcSupport();

  const [status, setStatus] = useState<ScanStatus>(
    nfcSupport.supported ? "idle" : "unsupported"
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  async function handleScan() {
    if (!nfcSupport.supported) return;
    if (status === "reading") return; // prevent double-tap

    setStatus("reading");
    setErrorMessage("");

    try {
      const payload = await readNfcTag();

      if (payload === null) {
        setStatus("error");
        setErrorMessage(
          "Could not read the card. Make sure the card is held flat against the back of the device."
        );
        return;
      }

      setStatus("success");
      onResult(payload);

      // Reset to idle after 2 seconds so the button can be used again.
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setErrorMessage("An unexpected error occurred. Please try again.");
    }
  }

  // ── Unsupported browser ─────────────────────────────────────────────────
  if (status === "unsupported") {
    return (
      <div
        role="alert"
        style={{
          padding: "12px 16px",
          borderRadius: "8px",
          backgroundColor: "#fef9c3",
          border: "1px solid #fde047",
          color: "#713f12",
          fontSize: "14px",
        }}
      >
        <strong>NFC not supported on this browser or device.</strong>
        <p style={{ margin: "4px 0 0", fontSize: "13px" }}>
          {nfcSupport.reason ??
            "NFC card scanning requires Chrome on an Android device with NFC hardware."}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: "13px" }}>
          Use the <strong>QR Code</strong> tab to scan the patient&apos;s card instead.
        </p>
      </div>
    );
  }

  // ── Button label and colour by status ───────────────────────────────────
  const labels: Record<ScanStatus, string> = {
    idle: "Tap NFC Card",
    reading: "Reading...",
    success: "Card Read Successfully",
    error: "Read Failed — Try Again",
    unsupported: "NFC Not Supported",
  };

  const colors: Record<ScanStatus, { bg: string; text: string; border: string }> = {
    idle: { bg: "#0d9488", text: "#ffffff", border: "#0f766e" },
    reading: { bg: "#0891b2", text: "#ffffff", border: "#0e7490" },
    success: { bg: "#16a34a", text: "#ffffff", border: "#15803d" },
    error: { bg: "#dc2626", text: "#ffffff", border: "#b91c1c" },
    unsupported: { bg: "#94a3b8", text: "#ffffff", border: "#94a3b8" },
  };

  const { bg, text, border } = colors[status];
  const isLoading = status === "reading";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <button
        type="button"
        onClick={() => void handleScan()}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        aria-label={labels[status]}
        style={{
          padding: "14px 28px",
          borderRadius: "8px",
          backgroundColor: bg,
          color: text,
          border: `2px solid ${border}`,
          fontSize: "15px",
          fontWeight: "bold",
          cursor: disabled || isLoading ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          transition: "background-color 0.2s",
        }}
      >
        {/* NFC icon */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2" />
          <path d="M4 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2" />
          <rect width="12" height="12" x="6" y="6" rx="2" />
          <path d="M12 12h.01" />
        </svg>

        {isLoading ? (
          <>
            <span
              style={{
                display: "inline-block",
                width: "14px",
                height: "14px",
                border: "2px solid rgba(255,255,255,0.3)",
                borderTopColor: "#ffffff",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
              }}
              aria-hidden="true"
            />
            {labels[status]}
          </>
        ) : (
          labels[status]
        )}
      </button>

      {/* Status messages */}
      {status === "error" && errorMessage && (
        <p
          role="alert"
          style={{
            fontSize: "13px",
            color: "#dc2626",
            margin: 0,
          }}
        >
          {errorMessage}
        </p>
      )}
      {status === "reading" && (
        <p
          aria-live="polite"
          style={{
            fontSize: "13px",
            color: "#0891b2",
            margin: 0,
          }}
        >
          Hold the card flat against the back of the device...
        </p>
      )}
    </div>
  );
}
