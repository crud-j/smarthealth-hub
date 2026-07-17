// Appointment-related TypeScript interfaces
// Mirrors backend/app/schemas/appointment.py

export type AppointmentStatus = "pending" | "confirmed" | "completed" | "missed" | "cancelled";
export type AppointmentType = "checkup" | "prenatal" | "follow_up" | "vaccination";

export interface Appointment {
  id: string;
  patientId: string;
  appointmentType: AppointmentType;
  scheduledAt: string;
  status: AppointmentStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
}
