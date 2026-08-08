/**
 * qrGenerator.worker.ts — Browser Web Worker
 *
 * Generates QR code images as data URIs off the main thread so the
 * HealthCardPreview component stays responsive during QR rendering.
 *
 * Uses the `qrcode` npm package (browser-safe, no native deps).
 * Exposed via Comlink for typed RPC-style calls from useWebWorker<QrGeneratorApi>.
 *
 * Falls back to main-thread generation in lib/qr.ts when Worker is
 * unsupported (per SDP §7.4.4 graceful degradation requirement).
 *
 * NOT related to backend/app/workers/ (Celery). This runs entirely in the
 * browser tab of the BHW's device.
 */
import * as Comlink from "comlink";
import QRCode from "qrcode";

const qrGeneratorApi = {
  /**
   * Generate a QR code data URI for the given text payload.
   *
   * Args:
   *   text — The full HMAC-signed verification URL
   *          (e.g. "https://smarthealthhub.local/verify?pid=...&v=1&sig=...")
   *          Only the URL string is encoded — no PHI in the payload.
   *
   * Returns: A "data:image/svg+xml,..." string ready for use in <img src>.
   *
   * Uses the SVG renderer (QRCode.toString), not toDataURL(). toDataURL()
   * renders via document.createElement('canvas') — Web Workers have no DOM,
   * so calling it here threw "document is not defined" inside the exposed
   * async function, which Comlink then failed to relay cleanly back to the
   * main thread (surfaced as "DataCloneError: #<Promise> could not be
   * cloned" instead of a normal rejection). toString()'s SVG renderer is
   * pure string generation with no DOM dependency, so it works in a Worker.
   */
  async generateDataUri(text: string): Promise<string> {
    const svg = await QRCode.toString(text, {
      width: 200,
      margin: 1,
      color: {
        dark: "#0f172a", // matches card CSS --dark token
        light: "#ffffff",
      },
    });
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  },
};

export type QrGeneratorApi = typeof qrGeneratorApi;
Comlink.expose(qrGeneratorApi);
