/**
 * qrScanner.worker.ts — Browser Web Worker
 *
 * Decodes QR codes from live camera frames off the main thread so the
 * camera preview on /health-cards/verify never stutters during scanning.
 *
 * Consumed via useWebWorker<QrScannerApi> in NfcScanButton.tsx.
 * Falls back to main-thread decoding when Worker is unsupported (see useWebWorker).
 *
 * NOT related to backend/app/workers/ (Celery). This runs entirely in the
 * BHW's browser tab.
 */
import * as Comlink from "comlink";
import jsQR from "jsqr";

const qrScannerApi = {
  /** Decodes a single video frame; returns the raw QR payload string or null. */
  decodeFrame(imageData: ImageData): string | null {
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    return result?.data ?? null;
  },
};

export type QrScannerApi = typeof qrScannerApi;
Comlink.expose(qrScannerApi);
