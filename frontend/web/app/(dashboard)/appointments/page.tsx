import type { Metadata } from "next";

export const metadata: Metadata = { title: "Appointments" };

/**
 * Appointments list/calendar page — manage scheduled visits,
 * track no-shows, and trigger SMS reminders.
 * Full implementation in Phase 4 (Appointments & SMS).
 */
export default function AppointmentsPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Appointments</h1>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Schedule and manage patient appointments
      </p>
      {/* TODO: Implement AppointmentCalendar and list view in Phase 4 */}
      <p style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
        Appointment management — coming in Phase 4
      </p>
    </div>
  );
}
