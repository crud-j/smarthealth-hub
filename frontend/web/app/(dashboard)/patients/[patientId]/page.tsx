export default async function PatientProfilePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return <div>Patient Profile: {patientId} — TODO Phase 2</div>;
}
