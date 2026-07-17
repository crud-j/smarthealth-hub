"use client";
import { use } from "react";

export default function PatientEditPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = use(params);
  return <div>Edit Patient: {patientId} — TODO Phase 2</div>;
}
