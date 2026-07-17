/**
 * @smarthealth-hub/shared-types — central re-export barrel.
 *
 * All TypeScript interfaces shared between the frontend (apps/web)
 * and any future server-side consumers are exported from here.
 */

// Patient domain
export type {
  Sex,
  CivilStatus,
  BloodType,
  PatientListItem,
  PatientResponse,
  PatientSummary,
  PaginatedPatients,
  PatientCreateInput,
} from "./patient";

// Appointment domain
export type {
  AppointmentStatus,
  AppointmentListItem,
  AppointmentResponse,
  AppointmentCreateInput,
  AppointmentUpdateInput,
  PaginatedAppointments,
} from "./appointment";
