// Printable card preview — triggers PDF download via GET /health-cards/{patientId}/pdf
export default function HealthCardPrintPage({ params }: { params: { patientId: string } }) {
  return <div>Health Card Print: {params.patientId} — TODO Phase 3</div>;
}
