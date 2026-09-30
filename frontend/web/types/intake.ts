/**
 * TypeScript types for purpose-specific intake details.
 * Must stay in sync with backend/app/schemas/intake.py PurposeDetails union.
 */

export type VisitPurposeValue =
  | "General Consultation"
  | "Immunization / Vaccination"
  | "Prenatal / Maternal Care"
  | "Family Planning"
  | "Dental Services"
  | "TB-DOTS Program"
  | "Child Health / Growth Monitoring"
  | "Hypertension / BP Monitoring"
  | "Diabetes Management"
  | "Wound Care / Dressing"
  | "Nutrition Counseling"
  | "Senior Citizens Health Check"
  | "Medical Certificate"
  | "Others";

export interface GeneralConsultationDetails {
  visit_purpose: "General Consultation";
  chief_complaint: string;
  duration_of_illness: string;
  current_medications: string;
  has_fever: boolean;
  has_cough: boolean;
  has_difficulty_breathing: boolean;
}

export interface ImmunizationDetails {
  visit_purpose: "Immunization / Vaccination";
  vaccine_name: string;
  is_for_self: boolean;
  child_age_months: number | null;
  is_catch_up: boolean;
  previous_adverse_reaction: string;
}

export interface PrenatalDetails {
  visit_purpose: "Prenatal / Maternal Care";
  age_of_gestation_weeks: number | null;
  prenatal_visit_number: number | null;
  gravida: number | null;
  para: number | null;
  has_hypertension: boolean;
  has_gestational_diabetes: boolean;
  is_high_risk: boolean;
}

export interface FamilyPlanningDetails {
  visit_purpose: "Family Planning";
  current_method: string;
  reason_for_visit: string;
  number_of_living_children: number | null;
  planning_intention: string;
}

export interface DentalDetails {
  visit_purpose: "Dental Services";
  chief_dental_complaint: string;
  affected_area: string;
  pain_severity: number | null;
  duration_of_pain: string;
  last_dental_visit_years: number | null;
  has_bleeding_gums: boolean;
  service_requested: string;
}

export interface TBDotsDetails {
  visit_purpose: "TB-DOTS Program";
  is_new_case: boolean;
  tb_registration_number: string;
  treatment_month: number | null;
  has_cough_2_weeks: boolean;
  has_hemoptysis: boolean;
  has_night_sweats: boolean;
  has_weight_loss: boolean;
  has_close_contact: boolean;
}

export interface ChildHealthDetails {
  visit_purpose: "Child Health / Growth Monitoring";
  child_age_months: number | null;
  muac_cm: number | null;
  nutritional_status: string;
  is_fully_immunized: boolean | null;
  vitamin_a_given: boolean;
  deworming_given: boolean;
  concern: string;
}

export interface HypertensionDetails {
  visit_purpose: "Hypertension / BP Monitoring";
  reported_bp_systolic: number | null;
  reported_bp_diastolic: number | null;
  is_on_medication: boolean;
  current_medications: string;
  has_headache: boolean;
  has_dizziness: boolean;
  has_chest_pain: boolean;
  last_bp_check: string;
}

export interface DiabetesDetails {
  visit_purpose: "Diabetes Management";
  reported_fasting_glucose: number | null;
  is_on_insulin: boolean;
  is_on_oral_medication: boolean;
  current_medications: string;
  has_polyuria: boolean;
  has_polydipsia: boolean;
  has_poor_wound_healing: boolean;
  last_hba1c: string;
}

export interface WoundCareDetails {
  visit_purpose: "Wound Care / Dressing";
  wound_location: string;
  wound_cause: string;
  wound_age_days: number | null;
  has_signs_of_infection: boolean;
  is_post_surgical: boolean;
  tetanus_status: string;
}

export interface NutritionDetails {
  visit_purpose: "Nutrition Counseling";
  target_group: string;
  concern: string;
  referred_by: string;
}

export interface SeniorHealthDetails {
  visit_purpose: "Senior Citizens Health Check";
  chief_complaint: string;
  has_hypertension: boolean;
  has_diabetes: boolean;
  has_arthritis: boolean;
  has_visual_impairment: boolean;
  has_hearing_impairment: boolean;
  mobility_status: string;
  current_medications: string;
}

export interface MedicalCertificateDetails {
  visit_purpose: "Medical Certificate";
  purpose_of_certificate: string;
  requesting_entity: string;
}

export interface OthersDetails {
  visit_purpose: "Others";
  free_text_purpose: string;
  chief_complaint: string;
}

export type PurposeDetails =
  | GeneralConsultationDetails
  | ImmunizationDetails
  | PrenatalDetails
  | FamilyPlanningDetails
  | DentalDetails
  | TBDotsDetails
  | ChildHealthDetails
  | HypertensionDetails
  | DiabetesDetails
  | WoundCareDetails
  | NutritionDetails
  | SeniorHealthDetails
  | MedicalCertificateDetails
  | OthersDetails;
