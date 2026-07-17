// Health card TypeScript interfaces
// Mirrors backend/app/schemas/health_card.py

export type CardStatus = "active" | "lost" | "reissued" | "revoked";

export interface HealthCard {
  id: string;
  patientId: string;
  cardNumber: string;
  qrPayloadHash: string;
  nfcUid?: string;
  cardVersion: number;
  status: CardStatus;
  issuedAt: string;
  expiresAt?: string;
  issuedBy: string;
}

export interface CardVerifyResult {
  patientId: string;
  patientName: string;
  lastVisitDate?: string;
  flags: { isSenior: boolean; isPwd: boolean; isPregnant: boolean };
}
