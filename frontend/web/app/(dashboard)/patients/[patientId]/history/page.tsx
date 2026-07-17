export default async function PatientHistoryPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return <div>Patient History: {patientId} — TODO Phase 2</div>;
}
