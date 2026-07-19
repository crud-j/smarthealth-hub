/**
 * lib/qr.ts — QR payload utilities and synchronous main-thread fallback decoder.
 *
 * Architecture:
 *   - Heavy CPU work (decoding camera frames in the live scan loop) is
 *     delegated to workers/qrScanner.worker.ts via useWebWorker.
 *   - QR image generation is delegated to workers/qrGenerator.worker.ts.
 *   - This file handles the fast, synchronous parts:
 *       parseQrPayload()       — parse the scanned URL and extract params
 *       decodeFrameOnMainThread() — synchronous fallback when Worker is unavailable
 *       generateQrDataUri()    — synchronous fallback QR image generation
 *
 * Per SDP §7.4.4, graceful degradation to main-thread execution is
 * mandatory.  BHW devices may be low-end Android tablets without full
 * Web Worker support in some locked-down WebViews.
 */

// ---------------------------------------------------------------------------
// QR payload parsing
// ---------------------------------------------------------------------------

export interface QrPayloadParams {
  patientId: string;
  cardVersion: number;
  sig: string;
}

/**
 * Parse the HMAC-signed QR payload URL and extract the three required fields.
 *
 * Expected URL format:
 *   https://smarthealthhub.local/verify?pid={uuid}&v={int}&sig={hmac_hex}
 *
 * Returns null if the URL is malformed or any required param is missing.
 * The caller should treat null as a scan failure and continue scanning.
 *
 * Security note: this function performs NO signature verification —
 * that is done server-side by POST /health-cards/verify.
 */
export function parseQrPayload(raw: string): QrPayloadParams | null {
  try {
    const url = new URL(raw);
    const pid = url.searchParams.get("pid");
    const vStr = url.searchParams.get("v");
    const sig = url.searchParams.get("sig");

    if (!pid || !vStr || !sig) return null;

    const v = parseInt(vStr, 10);
    if (isNaN(v)) return null;

    return { patientId: pid, cardVersion: v, sig };
  } catch {
    // URL constructor throws on malformed strings.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main-thread synchronous fallback decoder (used when Worker is unavailable)
// ---------------------------------------------------------------------------

/**
 * Decode a QR code from an ImageData frame on the main thread.
 *
 * This is the synchronous fallback path for environments where
 * Web Worker is unsupported (per SDP §7.4.4).
 *
 * In normal operation, decoding is performed in qrScanner.worker.ts via
 * useWebWorker<QrScannerApi>.decodeFrame() to keep the camera preview fluid.
 *
 * Returns the raw QR string (e.g. the signed URL) or null if no code found.
 */
export function decodeFrameOnMainThread(frame: ImageData): string | null {
  // jsQR is also bundled in the main chunk for this fallback path.
  // Dynamic import is NOT used here to keep the fallback synchronous.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jsQR = require("jsqr") as (
      data: Uint8ClampedArray,
      width: number,
      height: number
    ) => { data: string } | null;

    const result = jsQR(frame.data, frame.width, frame.height);
    return result?.data ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main-thread synchronous QR generation fallback
// ---------------------------------------------------------------------------

/**
 * Generate a QR code data URI synchronously on the main thread.
 *
 * Used when qrGenerator.worker.ts is unavailable (per SDP §7.4.4).
 * In normal operation, use useWebWorker<QrGeneratorApi>.generateDataUri()
 * to keep image generation off the main thread.
 *
 * Returns a Promise<string> to match the worker API signature so call
 * sites can use the same await pattern regardless of which path is active.
 */
export async function generateQrDataUri(text: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(text, { width: 200, margin: 1 });
}
