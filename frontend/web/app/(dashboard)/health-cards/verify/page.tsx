"use client";
/**
 * Live NFC-tap / QR-scan verification UI.
 * QR frame decoding is offloaded to qrScanner.worker.ts via useWebWorker
 * so the camera preview never stutters (§7.4).
 */
export default function HealthCardVerifyPage() {
  return <div>Health Card Verify — TODO Phase 3</div>;
}
