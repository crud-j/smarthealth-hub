/**
 * lib/nfc.ts — Web NFC read/write helpers (main-thread coordinator)
 *
 * Uses the browser's Web NFC API (navigator.nfc) to read/write NFC tags.
 * CPU-heavy decode work (frame-by-frame QR scanning that runs alongside NFC)
 * is delegated to workers/qrScanner.worker.ts via useWebWorker — this file
 * only handles the NFC tap events themselves, which are I/O-bound (not CPU).
 */

export async function readNfcTag(): Promise<{ patientId: string; cardVersion: number } | null> {
  // TODO: Phase 3 — implement Web NFC API read (navigator.nfc.push / NDEFReader)
  // Returns null on browsers/devices without NFC support
  return null;
}

export async function writeNfcTag(patientId: string, cardVersion: number): Promise<boolean> {
  // TODO: Phase 3 — write NDEF record {patient_id, card_version} to a blank NFC tag
  void patientId;
  void cardVersion;
  return false;
}
