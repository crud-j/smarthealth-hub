export default async function HealthCardPrintPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return <div>Health Card Print: {patientId} — TODO Phase 3</div>;
}
