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

/**
 * An optional choice from a <select>. Its "— Select —" option gives "", which
 * means "not chosen" (undefined), not an invalid value. Without this the empty
 * Blood Type / PhilHealth Category dropdowns failed with
 * "Invalid enum value ... received ''".
 */
function optionalChoice<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(values).optional().nullable(),
  );
}

/**
 * An optional number input. An empty <input type="number"> read with
 * valueAsNumber gives NaN: that means "not filled in", not an error.
 * (Without this, leaving Baseline Height / Weight empty blocked registration
 * with "Expected number, received nan".)
 */
function optionalNumber(schema: z.ZodNumber) {
  return z.preprocess(
    (v) => (v === "" || (typeof v === "number" && Number.isNaN(v)) ? undefined : v),
    schema.optional().nullable(),
  );
}

export const PHILHEALTH_CATEGORIES = [
  "indigent",
  "sponsored",
  "formal_economy",
  "informal_economy",
  "lifetime_member",
] as const;

/** PhilHealth No. (PIN): 12 digits, written 12-345678901-2. */
export const PHILHEALTH_NO_RE = /^\d{2}-?\d{9}-?\d$/;

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
  bloodType: optionalChoice(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"]),

  // Section 3 — PhilHealth (the rules between these fields: philhealthIssues)
  philhealthNo: z.string().max(20).optional().nullable(),
  philhealthMemberType: optionalChoice(["member", "dependent"]),
  philhealthCategory: optionalChoice(PHILHEALTH_CATEGORIES),
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
  gravida: optionalNumber(z.number().int("Gravida is a whole number.").min(0, "Gravida cannot be negative.")),
  para: optionalNumber(z.number().int("Para is a whole number.").min(0, "Para cannot be negative.")),
  estimatedDueDate: z.string().optional().nullable(),
  heightCm: optionalNumber(
    z.number().min(30, "Height must be 30 to 250 cm.").max(250, "Height must be 30 to 250 cm."),
  ),
  weightKg: optionalNumber(
    z.number().min(0.5, "Weight must be 0.5 to 500 kg.").max(500, "Weight must be 0.5 to 500 kg."),
  ),
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
  // 'manual': staff typed all fields. 'pre_visit': patient self-entry.
  // 'ocr' was the government-ID scan (removed); older records may still have it.
  registrationDataSource: z
    .enum(["manual", "ocr", "pre_visit"])
    .default("manual"),
});

export type PatientCreateFormValues = z.infer<typeof patientCreateSchema>;

/**
 * PhilHealth rules between the fields (messages as shown on the form):
 *   - None (no member type): nothing else needed; the form locks and clears
 *     the PhilHealth No. and category.
 *   - Member or Dependent: the PhilHealth No. is required.
 *   - Member: the category is required (a dependent is covered under the
 *     member's category, so it stays optional there).
 *   - A PhilHealth No., when given, has 12 digits (12-345678901-2).
 */
export function philhealthIssues(data: {
  philhealthNo?: string | null;
  philhealthMemberType?: string | null;
  philhealthCategory?: string | null;
}): Array<{ path: "philhealthNo" | "philhealthCategory"; message: string }> {
  const issues: Array<{ path: "philhealthNo" | "philhealthCategory"; message: string }> = [];
  const number = data.philhealthNo?.trim() ?? "";
  const type = data.philhealthMemberType;
  if (number && !PHILHEALTH_NO_RE.test(number)) {
    issues.push({ path: "philhealthNo", message: "PhilHealth No. must have 12 digits (e.g. 12-345678901-2)." });
  } else if (!number && (type === "member" || type === "dependent")) {
    issues.push({ path: "philhealthNo", message: "Enter the PhilHealth No. of this member or dependent." });
  }
  if (type === "member" && !data.philhealthCategory) {
    issues.push({ path: "philhealthCategory", message: "Choose the PhilHealth category of this member." });
  }
  return issues;
}

/**
 * The Register New Patient form: patientCreateSchema plus the PhilHealth
 * rules. (patientCreateSchema itself stays a plain object: the edit and
 * intake schemas are built from it with .pick / .extend.)
 */
export const patientRegistrationSchema = patientCreateSchema.superRefine((data, ctx) => {
  for (const issue of philhealthIssues(data)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message });
  }
});

/**
 * The address the backend will store and print, mirroring
 * `patient_service.compose_address` (change both together; the backend tests
 * in tests/test_patient_address.py use the same cases):
 *   - any location part (sitio/purok, barangay, municipality, province) filled:
 *     house/street, sitio/purok, barangay, municipality, province joined with ", "
 *   - otherwise the free-text address, falling back to the house/street.
 */
export function effectiveAddress(parts: {
  address?: string | null;
  houseStreet?: string | null;
  sitioPurok?: string | null;
  barangay?: string | null;
  municipality?: string | null;
  province?: string | null;
}): string {
  const clean = (p: string | null | undefined): string => p?.trim() ?? "";
  const location = [parts.sitioPurok, parts.barangay, parts.municipality, parts.province].map(clean);
  if (location.some(Boolean)) {
    return [clean(parts.houseStreet), ...location].filter(Boolean).join(", ");
  }
  return clean(parts.address) || clean(parts.houseStreet);
}

/**
 * Edit Patient form schema: only the fields the edit page shows.
 *
 * It must NOT be patientCreateSchema: registration requires fields the edit
 * page does not have (data privacy consent, ...), and older patients have no
 * structured address or emergency contact. Validation then failed on hidden
 * fields and "Save Changes" silently did nothing.
 */
export const patientUpdateSchema = patientCreateSchema
  .pick({
    firstName: true,
    middleName: true,
    lastName: true,
    birthDate: true,
    sex: true,
    civilStatus: true,
    bloodType: true,
    philhealthNo: true,
    philhealthMemberType: true,
    mobileNumber: true,
    sitioPurok: true,
    guardianName: true,
    guardianContact: true,
    isPwd: true,
    isPregnant: true,
    allergies: true,
    knownConditions: true,
  })
  .extend({
    // House no. / street / landmark (patients.house_street, VARCHAR 255).
    houseStreet: z.string().max(255, "House no. / street / landmark: 255 characters at most.").optional().nullable(),
    // Optional on edit: older patients only have the free-text address.
    barangay: z.string().max(150).optional().nullable(),
    municipality: z.string().max(150).optional().nullable(),
    province: z.string().max(150).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    // Optional on edit: older patients have no emergency contact on record.
    emergencyContactName: z.string().max(150).optional().nullable(),
    emergencyContactNumber: z
      .union([phMobileValidator("Emergency contact number"), z.literal("")])
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    if (!effectiveAddress(data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["address"],
        message: "Enter the barangay, municipality and province, or a complete address.",
      });
    }
  });
export type PatientUpdateFormValues = z.infer<typeof patientUpdateSchema>;

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
