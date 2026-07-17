export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;
  return <div>Appointment Detail: {appointmentId} — TODO Phase 4</div>;
}
