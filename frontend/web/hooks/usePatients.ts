"use client";
/**
 * Data hooks for the Patient module.
 *
 * All hooks use the native ``apiFetch`` wrapper from lib/api-client.ts and
 * React ``useState`` + ``useEffect`` for local state management.  TanStack
 * Query is not yet installed — this follows the same pattern as the existing
 * hooks in this project.
 *
 * Naming convention:
 *  The backend sends snake_case JSON; each hook maps responses to camelCase
 *  TypeScript interfaces defined in types/patient.ts.
 *
 * Hooks exported:
 *  usePatientList(params)   — paginated patient list with optional search/filters
 *  usePatient(id)           — single patient by ID
 *  useCreatePatient()       — mutation: POST /patients
 *  useUpdatePatient(id)     — mutation: PUT  /patients/{id}
 *  useDeactivatePatient()   — mutation: DELETE /patients/{id} (soft-deactivate, Admin only)
 *  usePatientVisits(id)     — list of visit summaries for a patient
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import type {
  Patient,
  PatientCreatePayload,
  PatientCreateResult,
  PatientDuplicateMatch,
  PaginatedPatients,
  PatientSummary,
  PatientUpdatePayload,
  VisitSummary,
  VisitCreatePayload,
  VisitUpdatePayload,
  Visit,
} from "@/types/patient";

// ---------------------------------------------------------------------------
// API response shapes (snake_case from backend)
// ---------------------------------------------------------------------------

export interface PatientApiResponse {
  id: string;
  patient_code: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  full_name: string;
  age: number;
  birth_date: string;
  sex: "male" | "female";
  civil_status?: string | null;
  household_number?: string | null;
  sitio_purok?: string | null;
  barangay?: string | null;
  municipality?: string | null;
  province?: string | null;
  occupation?: string | null;
  mobile_number?: string | null;
  address: string;
  guardian_name?: string | null;
  guardian_contact?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_number?: string | null;
  philhealth_no?: string | null;
  philhealth_member_type?: "member" | "dependent" | null;
  philhealth_category?:
    | "indigent"
    | "sponsored"
    | "formal_economy"
    | "informal_economy"
    | "lifetime_member"
    | null;
  is_4ps_beneficiary: boolean;
  household_id_4ps?: string | null;
  is_indigenous: boolean;
  place_of_birth?: string | null;
  mothers_maiden_name?: string | null;
  is_pwd: boolean;
  is_senior: boolean;
  is_pregnant: boolean;
  senior_id_number?: string | null;
  pwd_id_number?: string | null;
  last_menstrual_period?: string | null;
  gravida?: number | null;
  para?: number | null;
  estimated_due_date?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  allergies?: string | null;
  known_conditions?: string | null;
  registration_source?: "walk_in" | "referral" | "outreach" | "others" | null;
  registration_data_source?: "manual" | "ocr" | "pre_visit";
  data_privacy_consent: boolean;
  data_privacy_consent_at?: string | null;
  is_active: boolean;
  /** ABO/Rh blood group. Null when not recorded. */
  blood_type?: string | null;
  created_at: string;
  updated_at: string;
  /** Root-relative URL to the patient's profile photo, or null. */
  photo_path?: string | null;
}

interface PatientSummaryApiResponse {
  id: string;
  patient_code: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  full_name: string;
  age: number;
  birth_date: string;
  sex: "male" | "female";
  mobile_number?: string | null;
  is_senior: boolean;
  is_pwd: boolean;
  is_pregnant: boolean;
  is_active: boolean;
  /** ABO/Rh blood group. Null when not recorded. */
  blood_type?: string | null;
}

interface PaginatedPatientsApiResponse {
  items: PatientSummaryApiResponse[];
  total: number;
  page: number;
  page_size: number;
}

interface PatientDuplicateMatchApiResponse {
  id: string;
  patient_code: string;
  full_name: string;
  birth_date: string;
}

interface PatientCreateResultApiResponse {
  duplicate_warning: boolean;
  matches: PatientDuplicateMatchApiResponse[];
  patient: PatientApiResponse | null;
}

interface VisitSummaryApiResponse {
  id: string;
  patient_id: string;
  case_no?: string | null;
  visit_date: string;
  visit_type: string;
  chief_complaint?: string | null;
  blood_pressure?: string | null;
  temperature?: number | null;
  pulse_rate?: number | null;
  created_at: string;
}

interface VisitApiResponse extends VisitSummaryApiResponse {
  recorded_by?: string | null;
  respiratory_rate?: number | null;
  oxygen_saturation?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  past_medical_history?: string | null;
  present_medical_history?: string | null;
  diagnosis?: string | null;
  treatment_notes?: string | null;
  patient_name?: string | null;
}

// ---------------------------------------------------------------------------
// Mapping helpers (snake_case → camelCase)
// ---------------------------------------------------------------------------

export function mapPatient(r: PatientApiResponse): Patient {
  return {
    id: r.id,
    patientCode: r.patient_code,
    firstName: r.first_name,
    middleName: r.middle_name,
    lastName: r.last_name,
    fullName: r.full_name ||
      [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" "),
    age: r.age ?? 0,
    birthDate: r.birth_date,
    sex: r.sex,
    civilStatus: r.civil_status,
    householdNumber: r.household_number ?? null,
    sitioPurok: r.sitio_purok ?? null,
    barangay: r.barangay ?? null,
    municipality: r.municipality ?? null,
    province: r.province ?? null,
    occupation: r.occupation ?? null,
    mobileNumber: r.mobile_number,
    address: r.address,
    guardianName: r.guardian_name,
    guardianContact: r.guardian_contact,
    emergencyContactName: r.emergency_contact_name ?? null,
    emergencyContactNumber: r.emergency_contact_number ?? null,
    philhealthNo: r.philhealth_no,
    philhealthMemberType: r.philhealth_member_type,
    philhealthCategory: r.philhealth_category ?? null,
    is4psBeneficiary: r.is_4ps_beneficiary ?? false,
    householdId4ps: r.household_id_4ps ?? null,
    isIndigenous: r.is_indigenous ?? false,
    placeOfBirth: r.place_of_birth ?? null,
    mothersMaidenName: r.mothers_maiden_name ?? null,
    isPwd: r.is_pwd,
    isSenior: r.is_senior,
    isPregnant: r.is_pregnant,
    seniorIdNumber: r.senior_id_number ?? null,
    pwdIdNumber: r.pwd_id_number ?? null,
    lastMenstrualPeriod: r.last_menstrual_period ?? null,
    gravida: r.gravida ?? null,
    para: r.para ?? null,
    estimatedDueDate: r.estimated_due_date ?? null,
    heightCm: r.height_cm ?? null,
    weightKg: r.weight_kg ?? null,
    allergies: r.allergies ?? null,
    knownConditions: r.known_conditions ?? null,
    registrationSource: r.registration_source ?? null,
    registrationDataSource: r.registration_data_source ?? "manual",
    dataPrivacyConsent: r.data_privacy_consent ?? false,
    dataPrivacyConsentAt: r.data_privacy_consent_at ?? null,
    isActive: r.is_active,
    bloodType: r.blood_type ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    photoPath: r.photo_path ?? null,
  };
}

function mapDuplicateMatch(r: PatientDuplicateMatchApiResponse): PatientDuplicateMatch {
  return {
    id: r.id,
    patientCode: r.patient_code,
    fullName: r.full_name,
    birthDate: r.birth_date,
  };
}

function mapPatientSummary(r: PatientSummaryApiResponse): PatientSummary {
  return {
    id: r.id,
    patientCode: r.patient_code,
    firstName: r.first_name,
    middleName: r.middle_name,
    lastName: r.last_name,
    fullName: r.full_name ||
      [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" "),
    age: r.age ?? 0,
    birthDate: r.birth_date,
    sex: r.sex,
    mobileNumber: r.mobile_number,
    isSenior: r.is_senior,
    isPwd: r.is_pwd,
    isPregnant: r.is_pregnant,
    isActive: r.is_active,
    bloodType: r.blood_type ?? null,
  };
}

function mapVisitSummary(r: VisitSummaryApiResponse): VisitSummary {
  return {
    id: r.id,
    patientId: r.patient_id,
    caseNo: r.case_no,
    visitDate: r.visit_date,
    visitType: r.visit_type,
    chiefComplaint: r.chief_complaint,
    bloodPressure: r.blood_pressure,
    temperature: r.temperature,
    pulseRate: r.pulse_rate,
    createdAt: r.created_at,
  };
}

function mapVisit(r: VisitApiResponse): Visit {
  return {
    ...mapVisitSummary(r),
    recordedBy: r.recorded_by,
    respiratoryRate: r.respiratory_rate,
    oxygenSaturation: r.oxygen_saturation,
    weightKg: r.weight_kg,
    heightCm: r.height_cm,
    pastMedicalHistory: r.past_medical_history,
    presentMedicalHistory: r.present_medical_history,
    diagnosis: r.diagnosis,
    treatmentNotes: r.treatment_notes,
    patientName: r.patient_name,
  };
}

// Convert camelCase payload to snake_case for the backend
function toApiPayload(data: PatientCreatePayload): Record<string, unknown> {
  return {
    first_name: data.firstName,
    middle_name: data.middleName,
    last_name: data.lastName,
    birth_date: data.birthDate,
    sex: data.sex,
    civil_status: data.civilStatus,
    household_number: data.householdNumber,
    sitio_purok: data.sitioPurok,
    barangay: data.barangay,
    municipality: data.municipality,
    province: data.province,
    occupation: data.occupation,
    mobile_number: data.mobileNumber,
    address: data.address,
    guardian_name: data.guardianName,
    guardian_contact: data.guardianContact,
    emergency_contact_name: data.emergencyContactName,
    emergency_contact_number: data.emergencyContactNumber,
    philhealth_no: data.philhealthNo,
    philhealth_member_type: data.philhealthMemberType,
    philhealth_category: data.philhealthCategory,
    is_4ps_beneficiary: data.is4psBeneficiary,
    household_id_4ps: data.householdId4ps,
    is_indigenous: data.isIndigenous,
    place_of_birth: data.placeOfBirth,
    mothers_maiden_name: data.mothersMaidenName,
    is_pwd: data.isPwd,
    is_pregnant: data.isPregnant,
    senior_id_number: data.seniorIdNumber,
    pwd_id_number: data.pwdIdNumber,
    last_menstrual_period: data.lastMenstrualPeriod,
    gravida: data.gravida,
    para: data.para,
    estimated_due_date: data.estimatedDueDate,
    height_cm: data.heightCm,
    weight_kg: data.weightKg,
    allergies: data.allergies,
    known_conditions: data.knownConditions,
    registration_source: data.registrationSource,
    registration_data_source: data.registrationDataSource ?? "manual",
    data_privacy_consent: data.dataPrivacyConsent,
    blood_type: data.bloodType ?? null,
    confirm_duplicate: data.confirmDuplicate ?? false,
  };
}

function toVisitApiPayload(data: VisitCreatePayload): Record<string, unknown> {
  return {
    visit_type: data.visitType,
    visit_date: data.visitDate,
    case_no: data.caseNo,
    vital_signs: data.vitalSigns
      ? {
          blood_pressure: data.vitalSigns.bloodPressure,
          temperature: data.vitalSigns.temperature,
          pulse_rate: data.vitalSigns.pulseRate,
          respiratory_rate: data.vitalSigns.respiratoryRate,
          oxygen_saturation: data.vitalSigns.oxygenSaturation,
          weight_kg: data.vitalSigns.weightKg,
          height_cm: data.vitalSigns.heightCm,
        }
      : {},
    chief_complaint: data.chiefComplaint,
    past_medical_history: data.pastMedicalHistory,
    present_medical_history: data.presentMedicalHistory,
    diagnosis: data.diagnosis,
    treatment_notes: data.treatmentNotes,
  };
}

// ---------------------------------------------------------------------------
// usePatientList — paginated list with search and filters
// ---------------------------------------------------------------------------

export interface PatientListParams {
  q?: string;
  page?: number;
  pageSize?: number;
  isSenior?: boolean;
  isPwd?: boolean;
  isPregnant?: boolean;
}

export function usePatientList(params: PatientListParams = {}) {
  const [data, setData] = useState<PaginatedPatients | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Stable ref to avoid stale closures in the refetch callback
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = paramsRef.current;
      const qs = new URLSearchParams();
      if (p.q) qs.set("q", p.q);
      if (p.page) qs.set("page", String(p.page));
      if (p.pageSize) qs.set("page_size", String(p.pageSize));
      if (p.isSenior !== undefined) qs.set("is_senior", String(p.isSenior));
      if (p.isPwd !== undefined) qs.set("is_pwd", String(p.isPwd));
      if (p.isPregnant !== undefined) qs.set("is_pregnant", String(p.isPregnant));

      const raw = await apiFetch<PaginatedPatientsApiResponse>(
        `/patients?${qs.toString()}`
      );
      setData({
        items: raw.items.map(mapPatientSummary),
        total: raw.total,
        page: raw.page,
        pageSize: raw.page_size,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch();
  }, [fetch, params.q, params.page, params.pageSize, params.isSenior, params.isPwd, params.isPregnant]);

  return { data, loading, error, refetch: fetch };
}

// ---------------------------------------------------------------------------
// usePatient — single patient by ID
// ---------------------------------------------------------------------------

export function usePatient(id: string | null) {
  const [data, setData] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await apiFetch<PatientApiResponse>(`/patients/${id}`);
      setData(mapPatient(raw));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ---------------------------------------------------------------------------
// useCreatePatient — mutation
//
// POST /patients returns a PatientCreateResult wrapper rather than a bare
// Patient: either duplicateWarning=true with the matched existing patient(s)
// (no record created), or duplicateWarning=false with the newly created
// patient. Re-submitting with confirmDuplicate=true bypasses the warning.
// ---------------------------------------------------------------------------

export function useCreatePatient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const createPatient = useCallback(
    async (payload: PatientCreatePayload): Promise<PatientCreateResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const raw = await apiFetch<PatientCreateResultApiResponse>("/patients", {
          method: "POST",
          body: JSON.stringify(toApiPayload(payload)),
        });
        return {
          duplicateWarning: raw.duplicate_warning,
          matches: raw.matches.map(mapDuplicateMatch),
          patient: raw.patient ? mapPatient(raw.patient) : null,
        };
      } catch (err) {
        const apiErr =
          err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown");
        setError(apiErr);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { createPatient, loading, error };
}

// ---------------------------------------------------------------------------
// useUpdatePatient — mutation
// ---------------------------------------------------------------------------

export function useUpdatePatient(id: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const updatePatient = useCallback(
    async (payload: PatientUpdatePayload): Promise<Patient | null> => {
      setLoading(true);
      setError(null);
      try {
        const raw = await apiFetch<PatientApiResponse>(`/patients/${id}`, {
          method: "PUT",
          body: JSON.stringify(toApiPayload(payload as PatientCreatePayload)),
        });
        return mapPatient(raw);
      } catch (err) {
        const apiErr =
          err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown");
        setError(apiErr);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  return { updatePatient, loading, error };
}

// ---------------------------------------------------------------------------
// useDeactivatePatient — mutation (soft-delete, Admin only)
// ---------------------------------------------------------------------------

export function useDeactivatePatient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const deactivatePatient = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch<void>(`/patients/${id}`, { method: "DELETE" });
      return true;
    } catch (err) {
      const apiErr =
        err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown");
      setError(apiErr);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { deactivatePatient, loading, error };
}

// ---------------------------------------------------------------------------
// usePatientVisits — list visit summaries for a patient
// ---------------------------------------------------------------------------

export function usePatientVisits(patientId: string | null) {
  const [data, setData] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const fetch = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await apiFetch<VisitSummaryApiResponse[]>(
        `/patients/${patientId}/visits`
      );
      setData(raw.map(mapVisitSummary));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown"));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ---------------------------------------------------------------------------
// useCreateVisit — mutation
// ---------------------------------------------------------------------------

export function useCreateVisit(patientId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const createVisit = useCallback(
    async (payload: VisitCreatePayload): Promise<Visit | null> => {
      setLoading(true);
      setError(null);
      try {
        const raw = await apiFetch<VisitApiResponse>(
          `/patients/${patientId}/visits`,
          {
            method: "POST",
            body: JSON.stringify(toVisitApiPayload(payload)),
          }
        );
        return mapVisit(raw);
      } catch (err) {
        const apiErr =
          err instanceof ApiError ? err : new ApiError(String(err), 0, "unknown");
        setError(apiErr);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [patientId]
  );

  return { createVisit, loading, error };
}

// ---------------------------------------------------------------------------
// useBatchPdf — batch-print health cards for selected patients
//
// Calls POST /health-cards/batch-pdf with up to 50 patient UUIDs.
// On success, opens the returned PDF blob in a new browser tab.
// The object URL is revoked after 60 seconds to free browser memory.
//
// Only admin and bhw roles may call the underlying endpoint — the UI gates
// the button by role before calling printBatch, but the backend enforces
// this constraint independently with HTTP 403.
// ---------------------------------------------------------------------------

export function useBatchPdf(): {
  printBatch: (patientIds: string[]) => Promise<void>;
  loading: boolean;
} {
  const [loading, setLoading] = useState(false);

  const printBatch = useCallback(async (patientIds: string[]): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/health-cards/batch-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patient_ids: patientIds }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Revoke after 60 s to release browser memory.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setLoading(false);
    }
  }, []);

  return { printBatch, loading };
}

// ---------------------------------------------------------------------------
// useUpdateVisit — mutation: PUT /visits/{visitId}
// ---------------------------------------------------------------------------

export function useUpdateVisit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateVisit = useCallback(
    async (visitId: string, payload: VisitUpdatePayload): Promise<Visit | null> => {
      setLoading(true);
      setError(null);
      try {
        const raw = await apiFetch<VisitApiResponse>(`/visits/${visitId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        return mapVisit(raw);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to update visit.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { updateVisit, loading, error };
}
