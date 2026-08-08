/**
 * Zod schema mirroring AppointmentCreate Pydantic schema
 * (backend/app/schemas/appointment.py) and the frontend AppointmentCreatePayload
 * interface (types/appointment.ts).
 *
 * Field names are camelCase to match AppointmentCreatePayload.
 * The useCreateAppointment hook converts to snake_case before calling the API.
 *
 * Backend AppointmentCreate fields:
 *   patient_id  : UUID (required)
 *   appointment_type : str (required, non-blank)
 *   scheduled_at     : datetime (required, ISO string — must be future, validated server-side)
 *   notes            : str | None
 *
 * Frontend-specific: the form collects scheduledDate + scheduledTime separately
 * and combines them into scheduledAt before submission.
 */

import { z } from "zod";

// Appointment types available in the new-appointment form
// (matches AppointmentType in types/appointment.ts)
export const APPOINTMENT_TYPE_VALUES = [
  "checkup",
  "prenatal",
  "follow_up",
  "vaccination",
] as const;

export const appointmentCreateSchema = z.object({
  // Patient ID — UUID string; validated as non-empty (actual UUID check is
  // enforced by the patient-search UX: a patient must be selected from results)
  patientId: z.string().min(1, "Please select a patient from the search results."),

  // Appointment type from the frontend enum
  appointmentType: z.enum(APPOINTMENT_TYPE_VALUES, {
    errorMap: () => ({ message: "Please select an appointment type." }),
  }),

  // Date and time collected as separate strings in the form, combined into
  // scheduledAt (ISO datetime) before API submission
  scheduledDate: z.string().min(1, "Please pick a date for the appointment."),
  scheduledTime: z.string().min(1, "Please pick a time for the appointment."),

  // Notes — optional, max 500 chars (matches textarea maxLength in the form)
  notes: z.string().max(500).optional().nullable(),
});

export type AppointmentCreateFormValues = z.infer<typeof appointmentCreateSchema>;
