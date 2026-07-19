/**
 * lib/nfc.ts — Web NFC API read/write helpers.
 *
 * IMPORTANT BROWSER COMPATIBILITY NOTE:
 * Web NFC (NDEFReader / navigator.nfc) is supported ONLY in:
 *   - Chrome 89+ on Android (with NFC hardware)
 *   - Chrome OS (limited support)
 *
 * It is NOT supported in:
 *   - Any browser on iOS/iPadOS (Apple blocks Web NFC)
 *   - Firefox, Safari, Edge (as of 2026)
 *   - Desktop Chrome
 *
 * All functions check for support before use and return graceful fallback
 * values rather than throwing.  UI components must display a clear
 * "NFC not supported on this browser/device" message (not a crash).
 *
 * SDP Reference: §7.4.3 (NFC integration), §7.4.4 (graceful degradation)
 */

// ---------------------------------------------------------------------------
// Support detection
// ---------------------------------------------------------------------------

export interface NfcSupportResult {
  supported: boolean;
  reason?: string;
}

/**
 * Check whether Web NFC is available on the current browser/device.
 *
 * Returns { supported: true } when NDEFReader exists in the window object.
 * Returns { supported: false, reason: "..." } with a human-readable reason
 * when it is unavailable so the UI can display the correct message.
 */
export function checkNfcSupport(): NfcSupportResult {
  if (typeof window === "undefined") {
    return { supported: false, reason: "Running in a server-side context (no window)." };
  }
  if (!("NDEFReader" in window)) {
    return {
      supported: false,
      reason:
        "Web NFC is not supported on this browser or device. " +
        "NFC scanning requires Chrome on an Android device with NFC hardware.",
    };
  }
  return { supported: true };
}

// ---------------------------------------------------------------------------
// NFC payload shape
// ---------------------------------------------------------------------------

export interface NfcPayload {
  /** UUID string — the ONLY patient identifier written to the chip. */
  patient_id: string;
  /** Card version integer (used server-side to validate the tap). */
  card_version: number;
}

// ---------------------------------------------------------------------------
// Read NFC tag
// ---------------------------------------------------------------------------

/**
 * Read an NFC tag tap and return the parsed payload.
 *
 * Uses NDEFReader to wait for a single tap.  Parses the NDEF Text record
 * as JSON and validates it has the expected patient_id + card_version shape.
 *
 * Returns null on any error (unsupported browser, permission denied, parse
 * error, missing fields).  Never throws — callers receive null on failure.
 *
 * Security note: the NFC chip stores ONLY patient_id + card_version.
 * Any chip that contains additional fields is not a valid SmartHealth Hub
 * card — return null and do not process it.
 */
export async function readNfcTag(): Promise<NfcPayload | null> {
  const support = checkNfcSupport();
  if (!support.supported) return null;

  try {
    // NDEFReader is available — TypeScript does not have built-in types for
    // the Web NFC API, so we cast through unknown.
    type NDEFReader = {
      scan: (options?: { signal?: AbortSignal }) => Promise<void>;
      addEventListener: (
        event: "reading",
        handler: (ev: { serialNumber: string; message: NDEFMessage }) => void
      ) => void;
    };
    type NDEFMessage = {
      records: Array<{ recordType: string; data: DataView }>;
    };

    const reader = new (window as unknown as { NDEFReader: new () => NDEFReader }).NDEFReader();

    return await new Promise<NfcPayload | null>((resolve) => {
      reader.addEventListener("reading", ({ message }) => {
        try {
          for (const record of message.records) {
            if (record.recordType === "text") {
              const decoder = new TextDecoder();
              const text = decoder.decode(record.data);
              const parsed: unknown = JSON.parse(text);

              // Validate shape: must have patient_id (string) + card_version (number).
              if (
                parsed !== null &&
                typeof parsed === "object" &&
                "patient_id" in parsed &&
                "card_version" in parsed &&
                typeof (parsed as NfcPayload).patient_id === "string" &&
                typeof (parsed as NfcPayload).card_version === "number"
              ) {
                const payload = parsed as NfcPayload;
                // Extra guard: reject payloads that contain unexpected keys
                // (could indicate a non-SmartHealth Hub card or a tampered chip).
                const keys = Object.keys(payload);
                if (keys.length === 2) {
                  resolve(payload);
                  return;
                }
              }
            }
          }
          // No valid record found.
          resolve(null);
        } catch {
          resolve(null);
        }
      });

      // Start scanning — resolves the promise through the reading event.
      reader.scan().catch(() => resolve(null));
    });
  } catch {
    // Permission denied or NDEFReader instantiation failed.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Write NFC tag
// ---------------------------------------------------------------------------

/**
 * Write the minimal NFC payload to a blank or overwritable NFC chip.
 *
 * Called during card issuance (NFC provisioning flow) to write
 * {"patient_id": "...", "card_version": N} as an NDEF Text record.
 *
 * Security invariant: the payload written MUST contain ONLY patient_id and
 * card_version — never name, DOB, diagnosis, or any other PHI.
 *
 * Returns true on success, false on any failure (unsupported, permission
 * denied, write error).
 */
export async function writeNfcTag(payload: NfcPayload): Promise<boolean> {
  const support = checkNfcSupport();
  if (!support.supported) return false;

  // Double-check invariant: only patient_id + card_version may be written.
  const allowedKeys = new Set(["patient_id", "card_version"]);
  const payloadKeys = Object.keys(payload);
  if (payloadKeys.some((k) => !allowedKeys.has(k))) {
    // Refuse to write any payload containing unexpected keys — this is a
    // security invariant violation.
    console.error(
      "[nfc.ts] writeNfcTag() refused: payload contains unexpected keys beyond patient_id + card_version.",
      payloadKeys
    );
    return false;
  }

  try {
    type NDEFReader = {
      write: (records: {
        records: Array<{ recordType: string; data: string }>;
      }) => Promise<void>;
    };

    const writer = new (window as unknown as { NDEFReader: new () => NDEFReader }).NDEFReader();
    await writer.write({
      records: [
        {
          recordType: "text",
          data: JSON.stringify(payload),
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}
