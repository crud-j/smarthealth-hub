"use client";
/**
 * NfcScanButton — triggers NFC tap or live QR camera scan.
 *
 * QR frame decoding is offloaded to qrScanner.worker.ts via useWebWorker.
 * Falls back to decodeFrameOnMainThread() from lib/qr.ts when Worker
 * is unsupported (graceful degradation per §7.4.4).
 */
// TODO: Phase 3 — implement NFC/QR scan flow with worker integration
export default function NfcScanButton() {
  return <button type="button">Scan Card — TODO Phase 3</button>;
}
