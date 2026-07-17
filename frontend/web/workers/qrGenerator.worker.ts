/**
 * qrGenerator.worker.ts — Browser Web Worker
 *
 * Renders QR preview images (and their HMAC-signed payload strings) off the
 * main thread so scrolling and typing on the health-card pages stay fluid.
 *
 * Consumed via useWebWorker<QrGeneratorApi> in HealthCardPreview.tsx.
 */
import * as Comlink from "comlink";

const qrGeneratorApi = {
  /**
   * Builds the QR payload URL from patient ID, card version, and HMAC signature.
   * Actual QR image rendering (canvas/SVG) is done by the calling component using
   * this pre-computed payload string, keeping the worker dependency surface small.
   */
  buildPayload(patientId: string, cardVersion: number, sig: string): string {
    return `https://smarthealthhub.local/verify?pid=${patientId}&v=${cardVersion}&sig=${sig}`;
  },
};

export type QrGeneratorApi = typeof qrGeneratorApi;
Comlink.expose(qrGeneratorApi);
