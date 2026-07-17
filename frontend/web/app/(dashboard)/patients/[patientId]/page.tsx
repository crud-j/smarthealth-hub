// Patient profile page — demographics, summary, links to history/immunizations/visits
export default function PatientProfilePage({ params }: { params: { patientId: string } }) {
  return <div>Patient Profile: {params.patientId} — TODO Phase 2</div>;
}
