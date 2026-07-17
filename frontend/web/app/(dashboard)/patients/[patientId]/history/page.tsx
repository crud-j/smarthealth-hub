// Medical history and visit timeline — clinical staff only (RoleGuard enforced)
export default function PatientHistoryPage({ params }: { params: { patientId: string } }) {
  return <div>Patient History: {params.patientId} — TODO Phase 2</div>;
}
