"use client";
/**
 * PurposeDetailsForm — renders purpose-specific fields for intake Step 5.
 *
 * Props:
 *   visitPurpose  — the VisitPurposeValue selected in Step 1
 *   value         — current purpose_details state (Partial<PurposeDetails>)
 *   onChange      — called with the full updated details dict on every change
 *   errors        — field-level error messages keyed by snake_case field name
 */

import type {
  VisitPurposeValue,
  PurposeDetails,
  GeneralConsultationDetails,
  ImmunizationDetails,
  PrenatalDetails,
  FamilyPlanningDetails,
  DentalDetails,
  TBDotsDetails,
  ChildHealthDetails,
  HypertensionDetails,
  DiabetesDetails,
  WoundCareDetails,
  NutritionDetails,
  SeniorHealthDetails,
  MedicalCertificateDetails,
  OthersDetails,
} from "@/types/intake";

// ---------------------------------------------------------------------------
// Design tokens — copied exactly from app/intake/[token]/page.tsx
// ---------------------------------------------------------------------------

const C = {
  primary: "#b5343e",
  primaryDark: "#921f28",
  primaryBg: "#fdf2f3",
  primaryBorder: "#e8b4b8",
  text: "#1a0808",
  textMuted: "#6b4f4f",
  textSubtle: "#9c8080",
  border: "#e8ddd9",
  borderFocus: "#b5343e",
  surface: "#ffffff",
  surfaceAlt: "#faf7f7",
  success: "#166534",
  successBg: "#f0fdf4",
  successBorder: "#bbf7d0",
  error: "#991b1b",
  errorBg: "#fff1f2",
  errorBorder: "#fca5a5",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "0.5625rem 0.75rem",
  border: `1px solid ${C.border}`,
  borderRadius: "0.5rem",
  fontSize: "0.9375rem",
  color: C.text,
  background: C.surface,
  boxSizing: "border-box",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
  fontFamily: "inherit",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: C.textMuted,
  marginBottom: "0.3125rem",
  letterSpacing: "0.01em",
};

const errMsg: React.CSSProperties = {
  color: C.error,
  fontSize: "0.75rem",
  marginTop: "0.25rem",
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
  gap: "0.875rem",
};

const sectionDivider: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: C.textSubtle,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  marginTop: "1.5rem",
  marginBottom: "0.75rem",
  paddingBottom: "0.5rem",
  borderBottom: `1px solid ${C.border}`,
};

// ---------------------------------------------------------------------------
// Shared props type for all sub-components
// ---------------------------------------------------------------------------

interface SubFormProps {
  value: Partial<PurposeDetails>;
  onChange: (details: Partial<PurposeDetails>) => void;
  errors: Record<string, string | undefined>;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function ErrSpan({ name, errors }: { name: string; errors: Record<string, string | undefined> }) {
  if (!errors[name]) return null;
  return <span style={errMsg}>{errors[name]}</span>;
}

const checkboxLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  cursor: "pointer",
};

const checkboxText: React.CSSProperties = {
  fontSize: "0.875rem",
  color: C.text,
};

// ---------------------------------------------------------------------------
// 1. General Consultation
// ---------------------------------------------------------------------------

function GeneralConsultationForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<GeneralConsultationDetails>;
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>General Consultation Details</p>
      <div>
        <label style={label}>Chief Complaint *</label>
        <textarea
          rows={3}
          style={{ ...input, resize: "vertical" }}
          value={v.chief_complaint ?? ""}
          onChange={e => onChange({ ...v, chief_complaint: e.target.value })}
          placeholder="Describe your main concern or reason for today's visit…"
          maxLength={500}
        />
        <ErrSpan name="chief_complaint" errors={errors} />
      </div>
      <div style={twoCol}>
        <div>
          <label style={label}>Duration of Illness</label>
          <input
            style={input}
            value={v.duration_of_illness ?? ""}
            onChange={e => onChange({ ...v, duration_of_illness: e.target.value })}
            placeholder="e.g. 3 days, since Monday"
            maxLength={100}
          />
          <ErrSpan name="duration_of_illness" errors={errors} />
        </div>
      </div>
      <div>
        <label style={label}>Current Medications</label>
        <textarea
          rows={3}
          style={{ ...input, resize: "vertical" }}
          value={v.current_medications ?? ""}
          onChange={e => onChange({ ...v, current_medications: e.target.value })}
          placeholder="List any medicines you are currently taking, or write 'None'"
          maxLength={1000}
        />
        <ErrSpan name="current_medications" errors={errors} />
      </div>
      <p style={sectionDivider}>Symptoms</p>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_fever}
            onChange={e => onChange({ ...v, has_fever: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Fever</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_cough}
            onChange={e => onChange({ ...v, has_cough: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Cough</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_difficulty_breathing}
            onChange={e => onChange({ ...v, has_difficulty_breathing: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Difficulty breathing</span>
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Immunization / Vaccination
// ---------------------------------------------------------------------------

function ImmunizationForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<ImmunizationDetails>;
  const isForSelf = v.is_for_self !== false; // default true
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>Immunization Details</p>
      <div>
        <label style={label}>Vaccine Name</label>
        <select
          style={input}
          value={v.vaccine_name ?? ""}
          onChange={e => onChange({ ...v, vaccine_name: e.target.value })}
        >
          <option value="">Select vaccine…</option>
          <option value="BCG">BCG</option>
          <option value="OPV">OPV (Oral Polio)</option>
          <option value="DPT">DPT</option>
          <option value="Hepatitis B">Hepatitis B</option>
          <option value="MMR">MMR</option>
          <option value="Rotavirus">Rotavirus</option>
          <option value="PCV">PCV (Pneumococcal)</option>
          <option value="Other">Other</option>
        </select>
        <ErrSpan name="vaccine_name" errors={errors} />
      </div>
      <div>
        <label style={label}>Who is this vaccination for?</label>
        <div style={{ display: "flex", gap: "1.5rem", paddingTop: "0.375rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.9375rem", color: C.textMuted }}>
            <input
              type="radio"
              checked={isForSelf}
              onChange={() => onChange({ ...v, is_for_self: true, child_age_months: null })}
            />
            For myself
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.9375rem", color: C.textMuted }}>
            <input
              type="radio"
              checked={!isForSelf}
              onChange={() => onChange({ ...v, is_for_self: false })}
            />
            For a child
          </label>
        </div>
        <ErrSpan name="is_for_self" errors={errors} />
      </div>
      {!isForSelf && (
        <div style={{ maxWidth: 220 }}>
          <label style={label}>Child's Age (months)</label>
          <input
            type="number"
            style={input}
            min={0}
            max={216}
            value={v.child_age_months ?? ""}
            onChange={e => onChange({ ...v, child_age_months: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="e.g. 6"
          />
          <ErrSpan name="child_age_months" errors={errors} />
        </div>
      )}
      <label style={checkboxLabel}>
        <input
          type="checkbox"
          checked={!!v.is_catch_up}
          onChange={e => onChange({ ...v, is_catch_up: e.target.checked })}
          style={{ accentColor: C.primary }}
        />
        <span style={checkboxText}>This is a catch-up / missed dose</span>
      </label>
      <div>
        <label style={label}>Previous Adverse Reaction (if any)</label>
        <textarea
          rows={3}
          style={{ ...input, resize: "vertical" }}
          value={v.previous_adverse_reaction ?? ""}
          onChange={e => onChange({ ...v, previous_adverse_reaction: e.target.value })}
          placeholder="Describe any past reactions to vaccines, or leave blank"
          maxLength={500}
        />
        <ErrSpan name="previous_adverse_reaction" errors={errors} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Prenatal / Maternal Care
// ---------------------------------------------------------------------------

function PrenatalForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<PrenatalDetails>;
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>Prenatal / Obstetric Details</p>
      <div style={twoCol}>
        <div>
          <label style={label}>Age of Gestation (weeks)</label>
          <input
            type="number"
            style={input}
            min={0}
            max={45}
            value={v.age_of_gestation_weeks ?? ""}
            onChange={e => onChange({ ...v, age_of_gestation_weeks: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="e.g. 28"
          />
          <ErrSpan name="age_of_gestation_weeks" errors={errors} />
        </div>
        <div>
          <label style={label}>Prenatal Visit Number</label>
          <input
            type="number"
            style={input}
            min={1}
            max={20}
            value={v.prenatal_visit_number ?? ""}
            onChange={e => onChange({ ...v, prenatal_visit_number: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="e.g. 2"
          />
          <ErrSpan name="prenatal_visit_number" errors={errors} />
        </div>
        <div>
          <label style={label}>Gravida (total pregnancies)</label>
          <input
            type="number"
            style={input}
            min={0}
            value={v.gravida ?? ""}
            onChange={e => onChange({ ...v, gravida: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="0"
          />
          <ErrSpan name="gravida" errors={errors} />
        </div>
        <div>
          <label style={label}>Para (live births)</label>
          <input
            type="number"
            style={input}
            min={0}
            value={v.para ?? ""}
            onChange={e => onChange({ ...v, para: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="0"
          />
          <ErrSpan name="para" errors={errors} />
        </div>
      </div>
      <p style={sectionDivider}>Conditions</p>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_hypertension}
            onChange={e => onChange({ ...v, has_hypertension: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Hypertension during this pregnancy</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_gestational_diabetes}
            onChange={e => onChange({ ...v, has_gestational_diabetes: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Gestational diabetes</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.is_high_risk}
            onChange={e => onChange({ ...v, is_high_risk: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Self-reported high-risk pregnancy</span>
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Family Planning
// ---------------------------------------------------------------------------

function FamilyPlanningForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<FamilyPlanningDetails>;
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>Family Planning Details</p>
      <div style={twoCol}>
        <div>
          <label style={label}>Current Method</label>
          <select
            style={input}
            value={v.current_method ?? ""}
            onChange={e => onChange({ ...v, current_method: e.target.value })}
          >
            <option value="">Select method…</option>
            <option value="Pills">Pills</option>
            <option value="IUD">IUD</option>
            <option value="Injectable">Injectable</option>
            <option value="Implant">Implant</option>
            <option value="Condom">Condom</option>
            <option value="NFP">NFP (Natural Family Planning)</option>
            <option value="Bilateral Tubal Ligation">Bilateral Tubal Ligation</option>
            <option value="None">None</option>
          </select>
          <ErrSpan name="current_method" errors={errors} />
        </div>
        <div>
          <label style={label}>Reason for Visit</label>
          <select
            style={input}
            value={v.reason_for_visit ?? ""}
            onChange={e => onChange({ ...v, reason_for_visit: e.target.value })}
          >
            <option value="">Select reason…</option>
            <option value="New client">New client</option>
            <option value="Follow-up">Follow-up</option>
            <option value="Method change">Method change</option>
            <option value="Counseling only">Counseling only</option>
          </select>
          <ErrSpan name="reason_for_visit" errors={errors} />
        </div>
        <div>
          <label style={label}>Number of Living Children</label>
          <input
            type="number"
            style={input}
            min={0}
            value={v.number_of_living_children ?? ""}
            onChange={e => onChange({ ...v, number_of_living_children: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="0"
          />
          <ErrSpan name="number_of_living_children" errors={errors} />
        </div>
        <div>
          <label style={label}>Planning Intention</label>
          <select
            style={input}
            value={v.planning_intention ?? ""}
            onChange={e => onChange({ ...v, planning_intention: e.target.value })}
          >
            <option value="">Select…</option>
            <option value="Space births">Space births</option>
            <option value="Limit births">Limit births</option>
            <option value="Undecided">Undecided</option>
          </select>
          <ErrSpan name="planning_intention" errors={errors} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Dental Services
// ---------------------------------------------------------------------------

function DentalForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<DentalDetails>;
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>Dental Complaint Details</p>
      <div>
        <label style={label}>Chief Dental Complaint *</label>
        <textarea
          rows={3}
          style={{ ...input, resize: "vertical" }}
          value={v.chief_dental_complaint ?? ""}
          onChange={e => onChange({ ...v, chief_dental_complaint: e.target.value })}
          placeholder="e.g. Tooth pain upper right, gum bleeding, loose tooth…"
          maxLength={500}
        />
        <ErrSpan name="chief_dental_complaint" errors={errors} />
      </div>
      <div style={twoCol}>
        <div>
          <label style={label}>Affected Area</label>
          <input
            style={input}
            value={v.affected_area ?? ""}
            onChange={e => onChange({ ...v, affected_area: e.target.value })}
            placeholder="e.g. Upper right molar"
            maxLength={200}
          />
          <ErrSpan name="affected_area" errors={errors} />
        </div>
        <div>
          <label style={label}>Pain Severity (0 = none, 10 = worst)</label>
          <input
            type="number"
            style={input}
            min={0}
            max={10}
            value={v.pain_severity ?? ""}
            onChange={e => onChange({ ...v, pain_severity: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="0–10"
          />
          <ErrSpan name="pain_severity" errors={errors} />
        </div>
        <div>
          <label style={label}>Duration of Pain</label>
          <input
            style={input}
            value={v.duration_of_pain ?? ""}
            onChange={e => onChange({ ...v, duration_of_pain: e.target.value })}
            placeholder="e.g. 3 days, since last week"
            maxLength={100}
          />
          <ErrSpan name="duration_of_pain" errors={errors} />
        </div>
        <div>
          <label style={label}>Last Dental Visit (years ago)</label>
          <input
            type="number"
            style={input}
            min={0}
            value={v.last_dental_visit_years ?? ""}
            onChange={e => onChange({ ...v, last_dental_visit_years: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="e.g. 2"
          />
          <ErrSpan name="last_dental_visit_years" errors={errors} />
        </div>
      </div>
      <label style={checkboxLabel}>
        <input
          type="checkbox"
          checked={!!v.has_bleeding_gums}
          onChange={e => onChange({ ...v, has_bleeding_gums: e.target.checked })}
          style={{ accentColor: C.primary }}
        />
        <span style={checkboxText}>Has bleeding gums</span>
      </label>
      <div>
        <label style={label}>Service Requested</label>
        <select
          style={input}
          value={v.service_requested ?? ""}
          onChange={e => onChange({ ...v, service_requested: e.target.value })}
        >
          <option value="">Select service…</option>
          <option value="Extraction">Extraction</option>
          <option value="Oral Prophylaxis">Oral Prophylaxis</option>
          <option value="Restoration">Restoration</option>
          <option value="Oral Exam">Oral Exam</option>
          <option value="Other">Other</option>
        </select>
        <ErrSpan name="service_requested" errors={errors} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. TB-DOTS Program
// ---------------------------------------------------------------------------

function TBDotsForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<TBDotsDetails>;
  const isNew = v.is_new_case !== false; // default true
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>TB-DOTS Details</p>
      <div>
        <label style={label}>Case Type</label>
        <div style={{ display: "flex", gap: "1.5rem", paddingTop: "0.375rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.9375rem", color: C.textMuted }}>
            <input
              type="radio"
              checked={isNew}
              onChange={() => onChange({ ...v, is_new_case: true, tb_registration_number: "", treatment_month: null })}
            />
            New case
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.9375rem", color: C.textMuted }}>
            <input
              type="radio"
              checked={!isNew}
              onChange={() => onChange({ ...v, is_new_case: false })}
            />
            Follow-up (existing patient)
          </label>
        </div>
        <ErrSpan name="is_new_case" errors={errors} />
      </div>
      {!isNew && (
        <div style={twoCol}>
          <div>
            <label style={label}>TB Registration Number</label>
            <input
              style={input}
              value={v.tb_registration_number ?? ""}
              onChange={e => onChange({ ...v, tb_registration_number: e.target.value })}
              placeholder="e.g. TB-2024-001"
              maxLength={50}
            />
            <ErrSpan name="tb_registration_number" errors={errors} />
          </div>
          <div>
            <label style={label}>Treatment Month (1–24)</label>
            <input
              type="number"
              style={input}
              min={1}
              max={24}
              value={v.treatment_month ?? ""}
              onChange={e => onChange({ ...v, treatment_month: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="e.g. 3"
            />
            <ErrSpan name="treatment_month" errors={errors} />
          </div>
        </div>
      )}
      <p style={sectionDivider}>Symptoms</p>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_cough_2_weeks}
            onChange={e => onChange({ ...v, has_cough_2_weeks: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Cough lasting 2 weeks or more</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_hemoptysis}
            onChange={e => onChange({ ...v, has_hemoptysis: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Coughing up blood (hemoptysis)</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_night_sweats}
            onChange={e => onChange({ ...v, has_night_sweats: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Night sweats</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_weight_loss}
            onChange={e => onChange({ ...v, has_weight_loss: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Unexplained weight loss</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_close_contact}
            onChange={e => onChange({ ...v, has_close_contact: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Close contact with a known TB patient</span>
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Child Health / Growth Monitoring
// ---------------------------------------------------------------------------

function ChildHealthForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<ChildHealthDetails>;
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>Child Health Details</p>
      <div style={twoCol}>
        <div>
          <label style={label}>Child's Age (months)</label>
          <input
            type="number"
            style={input}
            min={0}
            max={60}
            value={v.child_age_months ?? ""}
            onChange={e => onChange({ ...v, child_age_months: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="0–60"
          />
          <ErrSpan name="child_age_months" errors={errors} />
        </div>
        <div>
          <label style={label}>MUAC (cm)</label>
          <input
            type="number"
            style={input}
            min={5}
            max={40}
            step={0.1}
            value={v.muac_cm ?? ""}
            onChange={e => onChange({ ...v, muac_cm: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="e.g. 13.5"
          />
          <ErrSpan name="muac_cm" errors={errors} />
        </div>
        <div>
          <label style={label}>Nutritional Status</label>
          <select
            style={input}
            value={v.nutritional_status ?? ""}
            onChange={e => onChange({ ...v, nutritional_status: e.target.value })}
          >
            <option value="">Select…</option>
            <option value="Normal">Normal</option>
            <option value="Underweight">Underweight</option>
            <option value="Severely Underweight">Severely Underweight</option>
            <option value="Overweight">Overweight</option>
          </select>
          <ErrSpan name="nutritional_status" errors={errors} />
        </div>
      </div>
      <div>
        <label style={label}>Is the child fully immunized?</label>
        <div style={{ display: "flex", gap: "1.5rem", paddingTop: "0.375rem" }}>
          {(["Yes", "No", "Unsure"] as const).map(opt => (
            <label
              key={opt}
              style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer", fontSize: "0.9375rem", color: C.textMuted }}
            >
              <input
                type="radio"
                checked={
                  opt === "Yes"
                    ? v.is_fully_immunized === true
                    : opt === "No"
                    ? v.is_fully_immunized === false
                    : v.is_fully_immunized === null || v.is_fully_immunized === undefined
                }
                onChange={() =>
                  onChange({
                    ...v,
                    is_fully_immunized: opt === "Yes" ? true : opt === "No" ? false : null,
                  })
                }
              />
              {opt}
            </label>
          ))}
        </div>
        <ErrSpan name="is_fully_immunized" errors={errors} />
      </div>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.vitamin_a_given}
            onChange={e => onChange({ ...v, vitamin_a_given: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Vitamin A supplementation given at last visit</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.deworming_given}
            onChange={e => onChange({ ...v, deworming_given: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Deworming given at last visit</span>
        </label>
      </div>
      <div>
        <label style={label}>Concern / Reason for Visit</label>
        <textarea
          rows={3}
          style={{ ...input, resize: "vertical" }}
          value={v.concern ?? ""}
          onChange={e => onChange({ ...v, concern: e.target.value })}
          placeholder="Describe any concerns about the child's health or growth…"
          maxLength={500}
        />
        <ErrSpan name="concern" errors={errors} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. Hypertension / BP Monitoring
// ---------------------------------------------------------------------------

function HypertensionForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<HypertensionDetails>;
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>Blood Pressure Details</p>
      <div style={twoCol}>
        <div>
          <label style={label}>Reported Systolic BP (mmHg)</label>
          <input
            type="number"
            style={input}
            min={60}
            max={300}
            value={v.reported_bp_systolic ?? ""}
            onChange={e => onChange({ ...v, reported_bp_systolic: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="e.g. 130"
          />
          <ErrSpan name="reported_bp_systolic" errors={errors} />
        </div>
        <div>
          <label style={label}>Reported Diastolic BP (mmHg)</label>
          <input
            type="number"
            style={input}
            min={40}
            max={200}
            value={v.reported_bp_diastolic ?? ""}
            onChange={e => onChange({ ...v, reported_bp_diastolic: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="e.g. 90"
          />
          <ErrSpan name="reported_bp_diastolic" errors={errors} />
        </div>
        <div>
          <label style={label}>When was your last BP reading?</label>
          <input
            style={input}
            value={v.last_bp_check ?? ""}
            onChange={e => onChange({ ...v, last_bp_check: e.target.value })}
            placeholder="e.g. Yesterday, 1 week ago"
            maxLength={50}
          />
          <ErrSpan name="last_bp_check" errors={errors} />
        </div>
      </div>
      <label style={checkboxLabel}>
        <input
          type="checkbox"
          checked={!!v.is_on_medication}
          onChange={e => onChange({ ...v, is_on_medication: e.target.checked })}
          style={{ accentColor: C.primary }}
        />
        <span style={checkboxText}>Currently taking BP medication</span>
      </label>
      {!!v.is_on_medication && (
        <div>
          <label style={label}>Current BP Medications</label>
          <textarea
            rows={3}
            style={{ ...input, resize: "vertical" }}
            value={v.current_medications ?? ""}
            onChange={e => onChange({ ...v, current_medications: e.target.value })}
            placeholder="List the medicines you are taking for blood pressure…"
            maxLength={500}
          />
          <ErrSpan name="current_medications" errors={errors} />
        </div>
      )}
      <p style={sectionDivider}>Symptoms</p>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_headache}
            onChange={e => onChange({ ...v, has_headache: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Headache</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_dizziness}
            onChange={e => onChange({ ...v, has_dizziness: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Dizziness</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_chest_pain}
            onChange={e => onChange({ ...v, has_chest_pain: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Chest pain</span>
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 9. Diabetes Management
// ---------------------------------------------------------------------------

function DiabetesForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<DiabetesDetails>;
  const showMeds = !!v.is_on_insulin || !!v.is_on_oral_medication;
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>Diabetes Management Details</p>
      <div style={twoCol}>
        <div>
          <label style={label}>Self-Reported Fasting Blood Glucose (mg/dL)</label>
          <input
            type="number"
            style={input}
            min={0}
            max={600}
            step={0.1}
            value={v.reported_fasting_glucose ?? ""}
            onChange={e => onChange({ ...v, reported_fasting_glucose: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="e.g. 126"
          />
          <ErrSpan name="reported_fasting_glucose" errors={errors} />
        </div>
        <div>
          <label style={label}>Last HbA1c Value</label>
          <input
            style={input}
            value={v.last_hba1c ?? ""}
            onChange={e => onChange({ ...v, last_hba1c: e.target.value })}
            placeholder="e.g. 7.2%"
            maxLength={20}
          />
          <ErrSpan name="last_hba1c" errors={errors} />
        </div>
      </div>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.is_on_insulin}
            onChange={e => onChange({ ...v, is_on_insulin: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Currently taking insulin</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.is_on_oral_medication}
            onChange={e => onChange({ ...v, is_on_oral_medication: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Currently taking oral diabetes medication</span>
        </label>
      </div>
      {showMeds && (
        <div>
          <label style={label}>Current Diabetes Medications</label>
          <textarea
            rows={3}
            style={{ ...input, resize: "vertical" }}
            value={v.current_medications ?? ""}
            onChange={e => onChange({ ...v, current_medications: e.target.value })}
            placeholder="List your diabetes medicines…"
            maxLength={500}
          />
          <ErrSpan name="current_medications" errors={errors} />
        </div>
      )}
      <p style={sectionDivider}>Symptoms</p>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_polyuria}
            onChange={e => onChange({ ...v, has_polyuria: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Frequent urination (polyuria)</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_polydipsia}
            onChange={e => onChange({ ...v, has_polydipsia: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Excessive thirst (polydipsia)</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_poor_wound_healing}
            onChange={e => onChange({ ...v, has_poor_wound_healing: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Poor wound healing</span>
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 10. Wound Care / Dressing
// ---------------------------------------------------------------------------

function WoundCareForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<WoundCareDetails>;
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>Wound Details</p>
      <div style={twoCol}>
        <div>
          <label style={label}>Wound Location</label>
          <input
            style={input}
            value={v.wound_location ?? ""}
            onChange={e => onChange({ ...v, wound_location: e.target.value })}
            placeholder="e.g. Right forearm, Left foot"
            maxLength={200}
          />
          <ErrSpan name="wound_location" errors={errors} />
        </div>
        <div>
          <label style={label}>Cause of Wound</label>
          <input
            style={input}
            value={v.wound_cause ?? ""}
            onChange={e => onChange({ ...v, wound_cause: e.target.value })}
            placeholder="e.g. Dog bite, laceration from fall"
            maxLength={300}
          />
          <ErrSpan name="wound_cause" errors={errors} />
        </div>
        <div>
          <label style={label}>How many days ago did this occur?</label>
          <input
            type="number"
            style={input}
            min={0}
            value={v.wound_age_days ?? ""}
            onChange={e => onChange({ ...v, wound_age_days: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="e.g. 3"
          />
          <ErrSpan name="wound_age_days" errors={errors} />
        </div>
        <div>
          <label style={label}>Tetanus Immunization Status</label>
          <select
            style={input}
            value={v.tetanus_status ?? ""}
            onChange={e => onChange({ ...v, tetanus_status: e.target.value })}
          >
            <option value="">Select…</option>
            <option value="Up to date">Up to date</option>
            <option value="Unknown">Unknown</option>
            <option value="Needs booster">Needs booster</option>
          </select>
          <ErrSpan name="tetanus_status" errors={errors} />
        </div>
      </div>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_signs_of_infection}
            onChange={e => onChange({ ...v, has_signs_of_infection: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Signs of infection (redness, swelling, pus)</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.is_post_surgical}
            onChange={e => onChange({ ...v, is_post_surgical: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Post-surgical wound</span>
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 11. Nutrition Counseling
// ---------------------------------------------------------------------------

function NutritionForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<NutritionDetails>;
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>Nutrition Counseling Details</p>
      <div style={twoCol}>
        <div>
          <label style={label}>Target Group</label>
          <select
            style={input}
            value={v.target_group ?? ""}
            onChange={e => onChange({ ...v, target_group: e.target.value })}
          >
            <option value="">Select group…</option>
            <option value="Under-5">Under-5 child</option>
            <option value="Pregnant">Pregnant</option>
            <option value="Lactating">Lactating</option>
            <option value="School-age">School-age</option>
            <option value="Adult">Adult</option>
          </select>
          <ErrSpan name="target_group" errors={errors} />
        </div>
        <div>
          <label style={label}>Referred By</label>
          <input
            style={input}
            value={v.referred_by ?? ""}
            onChange={e => onChange({ ...v, referred_by: e.target.value })}
            placeholder="e.g. BHW, Physician, Self"
            maxLength={200}
          />
          <ErrSpan name="referred_by" errors={errors} />
        </div>
      </div>
      <div>
        <label style={label}>Main Nutritional Concern</label>
        <textarea
          rows={3}
          style={{ ...input, resize: "vertical" }}
          value={v.concern ?? ""}
          onChange={e => onChange({ ...v, concern: e.target.value })}
          placeholder="e.g. Child is underweight, exclusive breastfeeding concerns…"
          maxLength={500}
        />
        <ErrSpan name="concern" errors={errors} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 12. Senior Citizens Health Check
// ---------------------------------------------------------------------------

function SeniorHealthForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<SeniorHealthDetails>;
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>Senior Health Check Details</p>
      <div>
        <label style={label}>Chief Complaint / Main Concern</label>
        <textarea
          rows={3}
          style={{ ...input, resize: "vertical" }}
          value={v.chief_complaint ?? ""}
          onChange={e => onChange({ ...v, chief_complaint: e.target.value })}
          placeholder="Describe your main health concern today…"
          maxLength={500}
        />
        <ErrSpan name="chief_complaint" errors={errors} />
      </div>
      <div>
        <label style={label}>Mobility Status</label>
        <select
          style={input}
          value={v.mobility_status ?? ""}
          onChange={e => onChange({ ...v, mobility_status: e.target.value })}
        >
          <option value="">Select…</option>
          <option value="Independent">Independent</option>
          <option value="Needs assistance">Needs assistance</option>
          <option value="Bedridden">Bedridden</option>
        </select>
        <ErrSpan name="mobility_status" errors={errors} />
      </div>
      <p style={sectionDivider}>Pre-existing Conditions</p>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_hypertension}
            onChange={e => onChange({ ...v, has_hypertension: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Hypertension</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_diabetes}
            onChange={e => onChange({ ...v, has_diabetes: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Diabetes</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_arthritis}
            onChange={e => onChange({ ...v, has_arthritis: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Arthritis</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_visual_impairment}
            onChange={e => onChange({ ...v, has_visual_impairment: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Visual impairment</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!v.has_hearing_impairment}
            onChange={e => onChange({ ...v, has_hearing_impairment: e.target.checked })}
            style={{ accentColor: C.primary }}
          />
          <span style={checkboxText}>Hearing impairment</span>
        </label>
      </div>
      <div>
        <label style={label}>Current Medications</label>
        <textarea
          rows={3}
          style={{ ...input, resize: "vertical" }}
          value={v.current_medications ?? ""}
          onChange={e => onChange({ ...v, current_medications: e.target.value })}
          placeholder="List all medicines currently being taken…"
          maxLength={1000}
        />
        <ErrSpan name="current_medications" errors={errors} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 13. Medical Certificate
// ---------------------------------------------------------------------------

function MedicalCertificateForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<MedicalCertificateDetails>;
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>Medical Certificate Details</p>
      <div style={twoCol}>
        <div>
          <label style={label}>Purpose of Certificate</label>
          <select
            style={input}
            value={v.purpose_of_certificate ?? ""}
            onChange={e => onChange({ ...v, purpose_of_certificate: e.target.value })}
          >
            <option value="">Select purpose…</option>
            <option value="Employment">Employment</option>
            <option value="School enrollment">School enrollment</option>
            <option value="Travel">Travel</option>
            <option value="Legal">Legal</option>
            <option value="Other">Other</option>
          </select>
          <ErrSpan name="purpose_of_certificate" errors={errors} />
        </div>
        <div>
          <label style={label}>Requesting Entity</label>
          <input
            style={input}
            value={v.requesting_entity ?? ""}
            onChange={e => onChange({ ...v, requesting_entity: e.target.value })}
            placeholder="e.g. Employer name, school name"
            maxLength={200}
          />
          <ErrSpan name="requesting_entity" errors={errors} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 14. Others
// ---------------------------------------------------------------------------

function OthersForm({ value, onChange, errors }: SubFormProps) {
  const v = value as Partial<OthersDetails>;
  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      <p style={sectionDivider}>Other Health Service</p>
      <div>
        <label style={label}>Please describe your purpose *</label>
        <textarea
          rows={3}
          style={{ ...input, resize: "vertical" }}
          value={v.free_text_purpose ?? ""}
          onChange={e => onChange({ ...v, free_text_purpose: e.target.value })}
          placeholder="Describe the health service or concern you are seeking…"
          maxLength={500}
        />
        <ErrSpan name="free_text_purpose" errors={errors} />
      </div>
      <div>
        <label style={label}>Chief Complaint (optional)</label>
        <textarea
          rows={3}
          style={{ ...input, resize: "vertical" }}
          value={v.chief_complaint ?? ""}
          onChange={e => onChange({ ...v, chief_complaint: e.target.value })}
          placeholder="Any additional symptoms or concerns…"
          maxLength={500}
        />
        <ErrSpan name="chief_complaint" errors={errors} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public dispatcher component
// ---------------------------------------------------------------------------

interface Props {
  visitPurpose: VisitPurposeValue;
  value: Partial<PurposeDetails>;
  onChange: (details: Partial<PurposeDetails>) => void;
  errors: Record<string, string | undefined>;
}

export function PurposeDetailsForm({ visitPurpose, value, onChange, errors }: Props) {
  switch (visitPurpose) {
    case "General Consultation":
      return <GeneralConsultationForm value={value} onChange={onChange} errors={errors} />;
    case "Immunization / Vaccination":
      return <ImmunizationForm value={value} onChange={onChange} errors={errors} />;
    case "Prenatal / Maternal Care":
      return <PrenatalForm value={value} onChange={onChange} errors={errors} />;
    case "Family Planning":
      return <FamilyPlanningForm value={value} onChange={onChange} errors={errors} />;
    case "Dental Services":
      return <DentalForm value={value} onChange={onChange} errors={errors} />;
    case "TB-DOTS Program":
      return <TBDotsForm value={value} onChange={onChange} errors={errors} />;
    case "Child Health / Growth Monitoring":
      return <ChildHealthForm value={value} onChange={onChange} errors={errors} />;
    case "Hypertension / BP Monitoring":
      return <HypertensionForm value={value} onChange={onChange} errors={errors} />;
    case "Diabetes Management":
      return <DiabetesForm value={value} onChange={onChange} errors={errors} />;
    case "Wound Care / Dressing":
      return <WoundCareForm value={value} onChange={onChange} errors={errors} />;
    case "Nutrition Counseling":
      return <NutritionForm value={value} onChange={onChange} errors={errors} />;
    case "Senior Citizens Health Check":
      return <SeniorHealthForm value={value} onChange={onChange} errors={errors} />;
    case "Medical Certificate":
      return <MedicalCertificateForm value={value} onChange={onChange} errors={errors} />;
    case "Others":
      return <OthersForm value={value} onChange={onChange} errors={errors} />;
    default:
      return null;
  }
}
