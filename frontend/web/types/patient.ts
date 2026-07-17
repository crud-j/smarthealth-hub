// Patient-related TypeScript interfaces
// Mirrors the Pydantic patient schemas in backend/app/schemas/patient.py

export interface Patient {
  id: string;
  patientCode: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  birthDate: string;
  sex: "male" | "female";
  civilStatus?: string;
  mobileNumber?: string;
  address: string;
  guardianName?: string;
  guardianContact?: string;
  philhealthNo?: string;
  isPwd: boolean;
  isSenior: boolean;
  isPregnant: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PatientSummary
  extends Pick<Patient, "id" | "patientCode" | "firstName" | "lastName" | "birthDate" | "sex"> {
  lastVisitDate?: string;
  flags: { isSenior: boolean; isPwd: boolean; isPregnant: boolean };
}
