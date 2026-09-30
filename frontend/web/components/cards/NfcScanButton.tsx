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
      <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>NFC not supported on this browser or device.</strong>
        <p className="mt-1 text-xs">
          {nfcSupport.reason ?? "NFC card scanning requires Chrome on an Android device with NFC hardware."}
        </p>
        <p className="mt-1 text-xs">
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
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void handleScan()}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        aria-label={labels[status]}
        className={`flex items-center gap-2.5 rounded-xl border-2 px-7 py-3.5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 ${disabled || isLoading ? "cursor-not-allowed" : "cursor-pointer"}`}
        style={{ backgroundColor: bg, color: text, borderColor: border, opacity: disabled ? 0.6 : 1 }}
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
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
            {labels[status]}
          </>
        ) : (
          labels[status]
        )}
      </button>

      {/* Status messages */}
      {status === "error" && errorMessage && (
        <p role="alert" className="text-sm font-medium text-[#dc2626]">{errorMessage}</p>
      )}
      {status === "reading" && (
        <p aria-live="polite" className="text-sm font-medium text-[#0891b2]">
          Hold the card flat against the back of the device...
        </p>
      )}
    </div>
  );
}
