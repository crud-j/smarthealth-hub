/**
 * Zod schema mirroring backend PatientCreate / PatientUpdate Pydantic schemas.
 *
 * Field names are camelCase to match PatientCreatePayload (types/patient.ts).
 * The useCreatePatient / useUpdatePatient hooks convert to snake_case before
 * sending to the API (see toApiPayload in hooks/usePatients.ts).
 *
 * Constraints mirror backend/app/schemas/patient.py exactly:
 *   - first_name / last_name: min 1, max 100
 *   - middle_name / guardian_name: max 100 / 150, optional
 *   - birth_date: must be in the past
 *   - sex: 'male' | 'female'
 *   - civil_status: max 20, optional
 *   - mobile_number / guardian_contact: Philippine mobile format
 *   - philhealth_no: max 20, optional
 *   - philhealth_member_type: 'member' | 'dependent' | null
 *   - is_pwd / is_pregnant: boolean, default false
 *   - blood_type: ABO/Rh enum or null
 *   - data_privacy_consent: required true
 *   - confirm_duplicate: boolean, default false (admin override flag)
 */

import { z } from "zod";

// Philippine mobile: +639XXXXXXXXX or 09XXXXXXXXX
const PH_MOBILE_RE = /^(\+63|0)(9\d{9})$/;

function phMobileValidator(label: string) {
  return z
    .string()
    .refine(
      (v) => {
        const stripped = v.trim().replace(/[\s\-]/g, "");
        return PH_MOBILE_RE.test(stripped);
      },
      {
        message: `${label} must be a valid Philippine mobile number (e.g. 09171234567 or +639171234567).`,
      }
    );
}

function requiredPhMobileValidator(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine(
      (v) => {
        const stripped = v.trim().replace(/[\s\-]/g, "");
        return PH_MOBILE_RE.test(stripped);
      },
      {
        message: `${label} must be a valid Philippine mobile number (e.g. 09171234567 or +639171234567).`,
      }
    );
}

export const patientCreateSchema = z.object({
  // Section 1 — Name
  firstName: z.string().min(1, "First name is required.").max(100),
  middleName: z.string().max(100).optional().nullable(),
  lastName: z.string().min(1, "Last name is required.").max(100),

  // Section 2 — Demographics
  birthDate: z
    .string()
    .min(1, "Birth date is required.")
    .refine((d) => new Date(d) < new Date(), {
      message: "Birth date must be in the past.",
    }),
  sex: z.enum(["male", "female"], {
    errorMap: () => ({ message: "Sex is required." }),
  }),
  civilStatus: z.string().max(20).optional().nullable(),
  householdNumber: z.string().max(50).optional().nullable(),
  sitioPurok: z.string().max(150).optional().nullable(),
  barangay: z.string().min(1, "Barangay is required.").max(150),
  municipality: z.string().min(1, "Municipality is required.").max(150),
  province: z.string().min(1, "Province is required.").max(150),
  occupation: z.string().max(150).optional().nullable(),
  bloodType: z
    .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"])
    .optional()
    .nullable(),

  // Section 3 — PhilHealth
  philhealthNo: z.string().max(20).optional().nullable(),
  philhealthMemberType: z.enum(["member", "dependent"]).optional().nullable(),
  philhealthCategory: z
    .enum([
      "indigent",
      "sponsored",
      "formal_economy",
      "informal_economy",
      "lifetime_member",
    ])
    .optional()
    .nullable(),
  is4psBeneficiary: z.boolean().default(false),
  householdId4ps: z.string().max(80).optional().nullable(),
  isIndigenous: z.boolean().default(false),
  placeOfBirth: z.string().max(150).optional().nullable(),
  mothersMaidenName: z.string().max(150).optional().nullable(),

  // Section 4 — Contact
  mobileNumber: z
    .union([phMobileValidator("Contact No."), z.literal("")])
    .optional()
    .nullable(),
  address: z.string().min(1, "Complete address is required."),
  emergencyContactName: z.string().min(1, "Emergency contact name is required.").max(150),
  emergencyContactNumber: requiredPhMobileValidator("Emergency contact number"),

  // Section 5 — Guardian
  guardianName: z.string().max(150).optional().nullable(),
  guardianContact: z
    .union([phMobileValidator("Guardian contact"), z.literal("")])
    .optional()
    .nullable(),

  // Section 6 — Special flags
  isPwd: z.boolean().default(false),
  isPregnant: z.boolean().default(false),
  seniorIdNumber: z.string().max(80).optional().nullable(),
  pwdIdNumber: z.string().max(80).optional().nullable(),
  lastMenstrualPeriod: z.string().optional().nullable(),
  gravida: z.number().int().min(0).optional().nullable(),
  para: z.number().int().min(0).optional().nullable(),
  estimatedDueDate: z.string().optional().nullable(),
  heightCm: z.number().min(30).max(250).optional().nullable(),
  weightKg: z.number().min(0.5).max(500).optional().nullable(),
  allergies: z.string().max(5000).optional().nullable(),
  knownConditions: z.string().max(5000).optional().nullable(),
  registrationSource: z
    .enum(["walk_in", "referral", "outreach", "others"])
    .default("walk_in"),
  dataPrivacyConsent: z
    .boolean()
    .refine((v) => v === true, { message: "Data privacy consent is required." }),

  // Duplicate override (Admin only — present in payload but hidden in UI)
  confirmDuplicate: z.boolean().default(false),

  // Data-entry source — set by the frontend based on how registration was initiated.
  // 'manual': staff typed all fields. 'ocr': ID scan autofill used. 'pre_visit': patient self-entry.
  registrationDataSource: z
    .enum(["manual", "ocr", "pre_visit"])
    .default("manual"),
});

export type PatientCreateFormValues = z.infer<typeof patientCreateSchema>;

/**
 * Edit form schema — same constraints but all fields optional except the
 * core required ones (first_name, last_name, birth_date, sex, address).
 * We reuse patientCreateSchema for the edit form via reset() since the edit
 * form enforces the same required fields.
 */
export const patientUpdateSchema = patientCreateSchema;
export type PatientUpdateFormValues = PatientCreateFormValues;

/**
 * Intake schema — used by the patient self-entry pre-visit form.
 * Relaxed version of patientCreateSchema:
 *   - Emergency contact fields are optional (patient may not have details on hand)
 *   - Mobile number validated as PH format when non-empty, but not required
 *   - civilStatus optional (BHW can fill this at finalization)
 *   - address required (needed for patient record)
 *   - All other required fields (name, birth date, sex, consent) are kept strict
 */

// PH mobile: validates format when non-empty, accepts empty/null as absent
const optionalPhMobile = z
  .string()
  .max(20)
  .optional()
  .nullable()
  .refine(
    (v) => {
      if (!v || !v.trim()) return true; // empty is fine — field is optional
      const stripped = v.trim().replace(/[\s\-]/g, "");
      return PH_MOBILE_RE.test(stripped);
    },
    {
      message: "Must be a valid Philippine mobile number (e.g. 09171234567 or +639171234567).",
    }
  );

export const patientIntakeSchema = patientCreateSchema.extend({
  // Relax civil status — patient may not know the exact label
  civilStatus: z.string().max(20).optional().nullable(),

  // Mobile fields: validate format when provided, but not required
  mobileNumber: optionalPhMobile,
  emergencyContactName: z.string().max(150).optional().nullable(),
  emergencyContactNumber: optionalPhMobile,
  guardianContact: optionalPhMobile,

  // birthDate: past date, not in the future, patient must be >= 0 years old
  birthDate: z
    .string()
    .min(1, "Birth date is required.")
    .refine((d) => !isNaN(new Date(d).getTime()), { message: "Enter a valid date." })
    .refine((d) => new Date(d) <= new Date(), { message: "Birth date cannot be in the future." }),
});

export type PatientIntakeFormValues = z.infer<typeof patientIntakeSchema>;
