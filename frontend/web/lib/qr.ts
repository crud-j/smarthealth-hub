/**
 * lib/qr.ts — QR generation/scan helpers (main-thread coordinator)
 *
 * Provides the main-thread interface for QR operations. CPU-heavy work
 * (decoding camera frames in a live scan loop) is delegated to
 * workers/qrScanner.worker.ts via useWebWorker in NfcScanButton.tsx.
 * Payload URL construction is delegated to workers/qrGenerator.worker.ts.
 *
 * This file handles only the fast, non-CPU-heavy parts: URL parsing,
 * HMAC signature extraction, and the synchronous main-thread fallback
 * for environments where Worker is unsupported.
 */

export function parseQrPayload(raw: string): {
  patientId: string;
  cardVersion: number;
  sig: string;
} | null {
  // TODO: Phase 3 — parse verify URL and extract pid, v, sig query params
  void raw;
  return null;
}

/** Synchronous fallback decoder used when Worker is unsupported. */
export function decodeFrameOnMainThread(_: ImageData): string | null {
  // TODO: Phase 3 — import jsQR directly and call synchronously
  return null;
}
