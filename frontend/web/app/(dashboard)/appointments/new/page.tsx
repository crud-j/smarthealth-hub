import type { Metadata } from "next";

export const metadata: Metadata = { title: "Schedule Appointment" };

/**
 * New appointment page — book an appointment for a patient,
 * with automatic SMS reminder scheduling via Celery + Semaphore.
 */
export default function NewAppointmentPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Schedule Appointment
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Book a new appointment and configure SMS reminders.
      </p>
      {/* TODO: Implement AppointmentForm in Phase 4 */}
      <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
        Appointment scheduling form — coming in Phase 4
      </p>
    </div>
  );
}
