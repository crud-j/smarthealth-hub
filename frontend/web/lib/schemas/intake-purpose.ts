/**
 * Zod schemas for purpose-specific intake detail groups.
 * Mirrors backend/app/schemas/intake.py PurposeDetails discriminated union.
 *
 * Field names are snake_case to match the backend JSON payload.
 * Bounds are taken from plan Section 4 (Per-Purpose Field Specifications).
 */

import { z } from "zod";
import type { VisitPurposeValue } from "@/types/intake";

// ── 1. General Consultation ───────────────────────────────────────────────────

export const generalConsultationSchema = z.object({
  visit_purpose: z.literal("General Consultation"),
  chief_complaint: z.string().max(500).default(""),
  duration_of_illness: z.string().max(100).default(""),
  current_medications: z.string().max(1000).default(""),
  has_fever: z.boolean().default(false),
  has_cough: z.boolean().default(false),
  has_difficulty_breathing: z.boolean().default(false),
});

// ── 2. Immunization / Vaccination ─────────────────────────────────────────────

export const immunizationSchema = z.object({
  visit_purpose: z.literal("Immunization / Vaccination"),
  vaccine_name: z.string().max(200).default(""),
  is_for_self: z.boolean().default(true),
  child_age_months: z.number().min(0).max(216).nullable().default(null),
  is_catch_up: z.boolean().default(false),
  previous_adverse_reaction: z.string().max(500).default(""),
});

// ── 3. Prenatal / Maternal Care ───────────────────────────────────────────────

export const prenatalSchema = z.object({
  visit_purpose: z.literal("Prenatal / Maternal Care"),
  age_of_gestation_weeks: z.number().min(0).max(45).nullable().default(null),
  prenatal_visit_number: z.number().min(1).max(20).nullable().default(null),
  gravida: z.number().min(0).nullable().default(null),
  para: z.number().min(0).nullable().default(null),
  has_hypertension: z.boolean().default(false),
  has_gestational_diabetes: z.boolean().default(false),
  is_high_risk: z.boolean().default(false),
});

// ── 4. Family Planning ────────────────────────────────────────────────────────

export const familyPlanningSchema = z.object({
  visit_purpose: z.literal("Family Planning"),
  current_method: z.string().max(200).default(""),
  reason_for_visit: z.string().max(500).default(""),
  number_of_living_children: z.number().min(0).nullable().default(null),
  planning_intention: z.string().max(100).default(""),
});

// ── 5. Dental Services ────────────────────────────────────────────────────────

export const dentalSchema = z.object({
  visit_purpose: z.literal("Dental Services"),
  chief_dental_complaint: z.string().max(500).default(""),
  affected_area: z.string().max(200).default(""),
  pain_severity: z.number().min(0).max(10).nullable().default(null),
  duration_of_pain: z.string().max(100).default(""),
  last_dental_visit_years: z.number().min(0).nullable().default(null),
  has_bleeding_gums: z.boolean().default(false),
  service_requested: z.string().max(200).default(""),
});

// ── 6. TB-DOTS Program ────────────────────────────────────────────────────────

export const tbDotsSchema = z.object({
  visit_purpose: z.literal("TB-DOTS Program"),
  is_new_case: z.boolean().default(false),
  tb_registration_number: z.string().max(50).default(""),
  treatment_month: z.number().min(1).max(24).nullable().default(null),
  has_cough_2_weeks: z.boolean().default(false),
  has_hemoptysis: z.boolean().default(false),
  has_night_sweats: z.boolean().default(false),
  has_weight_loss: z.boolean().default(false),
  has_close_contact: z.boolean().default(false),
});

// ── 7. Child Health / Growth Monitoring ──────────────────────────────────────

export const childHealthSchema = z.object({
  visit_purpose: z.literal("Child Health / Growth Monitoring"),
  child_age_months: z.number().min(0).max(60).nullable().default(null),
  muac_cm: z.number().min(5).max(40).nullable().default(null),
  nutritional_status: z.string().max(50).default(""),
  is_fully_immunized: z.boolean().nullable().default(null),
  vitamin_a_given: z.boolean().default(false),
  deworming_given: z.boolean().default(false),
  concern: z.string().max(500).default(""),
});

// ── 8. Hypertension / BP Monitoring ──────────────────────────────────────────

export const hypertensionSchema = z.object({
  visit_purpose: z.literal("Hypertension / BP Monitoring"),
  reported_bp_systolic: z.number().min(60).max(300).nullable().default(null),
  reported_bp_diastolic: z.number().min(40).max(200).nullable().default(null),
  is_on_medication: z.boolean().default(false),
  current_medications: z.string().max(500).default(""),
  has_headache: z.boolean().default(false),
  has_dizziness: z.boolean().default(false),
  has_chest_pain: z.boolean().default(false),
  last_bp_check: z.string().max(50).default(""),
});

// ── 9. Diabetes Management ────────────────────────────────────────────────────

export const diabetesSchema = z.object({
  visit_purpose: z.literal("Diabetes Management"),
  reported_fasting_glucose: z.number().min(0).max(600).nullable().default(null),
  is_on_insulin: z.boolean().default(false),
  is_on_oral_medication: z.boolean().default(false),
  current_medications: z.string().max(500).default(""),
  has_polyuria: z.boolean().default(false),
  has_polydipsia: z.boolean().default(false),
  has_poor_wound_healing: z.boolean().default(false),
  last_hba1c: z.string().max(20).default(""),
});

// ── 10. Wound Care / Dressing ─────────────────────────────────────────────────

export const woundCareSchema = z.object({
  visit_purpose: z.literal("Wound Care / Dressing"),
  wound_location: z.string().max(200).default(""),
  wound_cause: z.string().max(300).default(""),
  wound_age_days: z.number().min(0).nullable().default(null),
  has_signs_of_infection: z.boolean().default(false),
  is_post_surgical: z.boolean().default(false),
  tetanus_status: z.string().max(100).default(""),
});

// ── 11. Nutrition Counseling ──────────────────────────────────────────────────

export const nutritionSchema = z.object({
  visit_purpose: z.literal("Nutrition Counseling"),
  target_group: z.string().max(100).default(""),
  concern: z.string().max(500).default(""),
  referred_by: z.string().max(200).default(""),
});

// ── 12. Senior Citizens Health Check ──────────────────────────────────────────

export const seniorHealthSchema = z.object({
  visit_purpose: z.literal("Senior Citizens Health Check"),
  chief_complaint: z.string().max(500).default(""),
  has_hypertension: z.boolean().default(false),
  has_diabetes: z.boolean().default(false),
  has_arthritis: z.boolean().default(false),
  has_visual_impairment: z.boolean().default(false),
  has_hearing_impairment: z.boolean().default(false),
  mobility_status: z.string().max(100).default(""),
  current_medications: z.string().max(1000).default(""),
});

// ── 13. Medical Certificate ───────────────────────────────────────────────────

export const medicalCertificateSchema = z.object({
  visit_purpose: z.literal("Medical Certificate"),
  purpose_of_certificate: z.string().max(300).default(""),
  requesting_entity: z.string().max(200).default(""),
});

// ── 14. Others ────────────────────────────────────────────────────────────────

export const othersSchema = z.object({
  visit_purpose: z.literal("Others"),
  free_text_purpose: z.string().max(500).default(""),
  chief_complaint: z.string().max(500).default(""),
});

// ── Lookup map ────────────────────────────────────────────────────────────────

export const purposeDetailsSchemas: Record<VisitPurposeValue, z.ZodTypeAny> = {
  "General Consultation": generalConsultationSchema,
  "Immunization / Vaccination": immunizationSchema,
  "Prenatal / Maternal Care": prenatalSchema,
  "Family Planning": familyPlanningSchema,
  "Dental Services": dentalSchema,
  "TB-DOTS Program": tbDotsSchema,
  "Child Health / Growth Monitoring": childHealthSchema,
  "Hypertension / BP Monitoring": hypertensionSchema,
  "Diabetes Management": diabetesSchema,
  "Wound Care / Dressing": woundCareSchema,
  "Nutrition Counseling": nutritionSchema,
  "Senior Citizens Health Check": seniorHealthSchema,
  "Medical Certificate": medicalCertificateSchema,
  "Others": othersSchema,
};

export function getPurposeSchema(purpose: VisitPurposeValue): z.ZodTypeAny {
  return purposeDetailsSchemas[purpose];
}
