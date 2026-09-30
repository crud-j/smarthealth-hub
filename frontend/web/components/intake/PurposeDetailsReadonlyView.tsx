"use client";
/**
 * PurposeDetailsReadonlyView — renders purpose-specific intake fields as
 * labeled key-value rows for admin/staff review panels.
 *
 * Props:
 *   visitPurpose   — the visit purpose string (e.g. "Dental Services")
 *   purposeDetails — the raw purpose_details dict from the intake token row
 */

interface Props {
  visitPurpose: string | null;
  purposeDetails: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function val(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (v === true) return "Yes";
  if (v === false) return "No";
  return String(v);
}

function Row({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ marginBottom: "0.625rem" }}>
      <p
        style={{
          fontSize: "0.6875rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#b09090",
          marginBottom: "0.125rem",
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#1a0808" }}>
        {val(value)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PurposeDetailsReadonlyView({ visitPurpose, purposeDetails }: Props) {
  if (!visitPurpose || !purposeDetails) return null;

  const d = purposeDetails;

  switch (visitPurpose) {
    // -----------------------------------------------------------------------
    // 1. General Consultation
    // -----------------------------------------------------------------------
    case "General Consultation":
      return (
        <div>
          <Row label="Chief Complaint" value={d["chief_complaint"]} />
          <Row label="Duration of Illness" value={d["duration_of_illness"]} />
          <Row label="Current Medications" value={d["current_medications"]} />
          <Row label="Has Fever" value={d["has_fever"]} />
          <Row label="Has Cough" value={d["has_cough"]} />
          <Row label="Has Difficulty Breathing" value={d["has_difficulty_breathing"]} />
        </div>
      );

    // -----------------------------------------------------------------------
    // 2. Immunization / Vaccination
    // -----------------------------------------------------------------------
    case "Immunization / Vaccination":
      return (
        <div>
          <Row label="Vaccine Name" value={d["vaccine_name"]} />
          <Row label="For Self" value={d["is_for_self"]} />
          <Row label="Child Age (months)" value={d["child_age_months"]} />
          <Row label="Catch-Up / Missed Dose" value={d["is_catch_up"]} />
          <Row label="Previous Adverse Reaction" value={d["previous_adverse_reaction"]} />
        </div>
      );

    // -----------------------------------------------------------------------
    // 3. Prenatal / Maternal Care
    // -----------------------------------------------------------------------
    case "Prenatal / Maternal Care":
      return (
        <div>
          <Row label="Age of Gestation (weeks)" value={d["age_of_gestation_weeks"]} />
          <Row label="Prenatal Visit Number" value={d["prenatal_visit_number"]} />
          <Row label="Gravida (Total Pregnancies)" value={d["gravida"]} />
          <Row label="Para (Live Births)" value={d["para"]} />
          <Row label="Has Hypertension" value={d["has_hypertension"]} />
          <Row label="Has Gestational Diabetes" value={d["has_gestational_diabetes"]} />
          <Row label="Self-Reported High-Risk Pregnancy" value={d["is_high_risk"]} />
        </div>
      );

    // -----------------------------------------------------------------------
    // 4. Family Planning
    // -----------------------------------------------------------------------
    case "Family Planning":
      return (
        <div>
          <Row label="Current Method" value={d["current_method"]} />
          <Row label="Reason for Visit" value={d["reason_for_visit"]} />
          <Row label="Number of Living Children" value={d["number_of_living_children"]} />
          <Row label="Planning Intention" value={d["planning_intention"]} />
        </div>
      );

    // -----------------------------------------------------------------------
    // 5. Dental Services
    // -----------------------------------------------------------------------
    case "Dental Services":
      return (
        <div>
          <Row label="Chief Dental Complaint" value={d["chief_dental_complaint"]} />
          <Row label="Affected Area" value={d["affected_area"]} />
          <Row label="Pain Severity (0–10)" value={d["pain_severity"]} />
          <Row label="Duration of Pain" value={d["duration_of_pain"]} />
          <Row label="Last Dental Visit (years ago)" value={d["last_dental_visit_years"]} />
          <Row label="Has Bleeding Gums" value={d["has_bleeding_gums"]} />
          <Row label="Service Requested" value={d["service_requested"]} />
        </div>
      );

    // -----------------------------------------------------------------------
    // 6. TB-DOTS Program
    // -----------------------------------------------------------------------
    case "TB-DOTS Program":
      return (
        <div>
          <Row label="New Case" value={d["is_new_case"]} />
          <Row label="TB Registration Number" value={d["tb_registration_number"]} />
          <Row label="Treatment Month" value={d["treatment_month"]} />
          <Row label="Cough Lasting 2+ Weeks" value={d["has_cough_2_weeks"]} />
          <Row label="Coughing Up Blood (Hemoptysis)" value={d["has_hemoptysis"]} />
          <Row label="Night Sweats" value={d["has_night_sweats"]} />
          <Row label="Unexplained Weight Loss" value={d["has_weight_loss"]} />
          <Row label="Close Contact with TB Patient" value={d["has_close_contact"]} />
        </div>
      );

    // -----------------------------------------------------------------------
    // 7. Child Health / Growth Monitoring
    // -----------------------------------------------------------------------
    case "Child Health / Growth Monitoring":
      return (
        <div>
          <Row label="Child Age (months)" value={d["child_age_months"]} />
          <Row label="MUAC (cm)" value={d["muac_cm"]} />
          <Row label="Nutritional Status" value={d["nutritional_status"]} />
          <Row
            label="Fully Immunized"
            value={
              d["is_fully_immunized"] === true
                ? "Yes"
                : d["is_fully_immunized"] === false
                ? "No"
                : "Unsure"
            }
          />
          <Row label="Vitamin A Supplementation Given" value={d["vitamin_a_given"]} />
          <Row label="Deworming Given" value={d["deworming_given"]} />
          <Row label="Concern / Reason for Visit" value={d["concern"]} />
        </div>
      );

    // -----------------------------------------------------------------------
    // 8. Hypertension / BP Monitoring
    // -----------------------------------------------------------------------
    case "Hypertension / BP Monitoring":
      return (
        <div>
          <Row label="Reported Systolic BP (mmHg)" value={d["reported_bp_systolic"]} />
          <Row label="Reported Diastolic BP (mmHg)" value={d["reported_bp_diastolic"]} />
          <Row label="On BP Medication" value={d["is_on_medication"]} />
          <Row label="Current BP Medications" value={d["current_medications"]} />
          <Row label="Has Headache" value={d["has_headache"]} />
          <Row label="Has Dizziness" value={d["has_dizziness"]} />
          <Row label="Has Chest Pain" value={d["has_chest_pain"]} />
          <Row label="Last BP Reading" value={d["last_bp_check"]} />
        </div>
      );

    // -----------------------------------------------------------------------
    // 9. Diabetes Management
    // -----------------------------------------------------------------------
    case "Diabetes Management":
      return (
        <div>
          <Row label="Reported Fasting Blood Glucose (mg/dL)" value={d["reported_fasting_glucose"]} />
          <Row label="On Insulin" value={d["is_on_insulin"]} />
          <Row label="On Oral Medication" value={d["is_on_oral_medication"]} />
          <Row label="Current Diabetes Medications" value={d["current_medications"]} />
          <Row label="Frequent Urination (Polyuria)" value={d["has_polyuria"]} />
          <Row label="Excessive Thirst (Polydipsia)" value={d["has_polydipsia"]} />
          <Row label="Poor Wound Healing" value={d["has_poor_wound_healing"]} />
          <Row label="Last HbA1c Value" value={d["last_hba1c"]} />
        </div>
      );

    // -----------------------------------------------------------------------
    // 10. Wound Care / Dressing
    // -----------------------------------------------------------------------
    case "Wound Care / Dressing":
      return (
        <div>
          <Row label="Wound Location" value={d["wound_location"]} />
          <Row label="Cause of Wound" value={d["wound_cause"]} />
          <Row label="Wound Age (days)" value={d["wound_age_days"]} />
          <Row label="Signs of Infection" value={d["has_signs_of_infection"]} />
          <Row label="Post-Surgical Wound" value={d["is_post_surgical"]} />
          <Row label="Tetanus Immunization Status" value={d["tetanus_status"]} />
        </div>
      );

    // -----------------------------------------------------------------------
    // 11. Nutrition Counseling
    // -----------------------------------------------------------------------
    case "Nutrition Counseling":
      return (
        <div>
          <Row label="Target Group" value={d["target_group"]} />
          <Row label="Main Nutritional Concern" value={d["concern"]} />
          <Row label="Referred By" value={d["referred_by"]} />
        </div>
      );

    // -----------------------------------------------------------------------
    // 12. Senior Citizens Health Check
    // -----------------------------------------------------------------------
    case "Senior Citizens Health Check":
      return (
        <div>
          <Row label="Chief Complaint" value={d["chief_complaint"]} />
          <Row label="Has Hypertension" value={d["has_hypertension"]} />
          <Row label="Has Diabetes" value={d["has_diabetes"]} />
          <Row label="Has Arthritis" value={d["has_arthritis"]} />
          <Row label="Has Visual Impairment" value={d["has_visual_impairment"]} />
          <Row label="Has Hearing Impairment" value={d["has_hearing_impairment"]} />
          <Row label="Mobility Status" value={d["mobility_status"]} />
          <Row label="Current Medications" value={d["current_medications"]} />
        </div>
      );

    // -----------------------------------------------------------------------
    // 13. Medical Certificate
    // -----------------------------------------------------------------------
    case "Medical Certificate":
      return (
        <div>
          <Row label="Purpose of Certificate" value={d["purpose_of_certificate"]} />
          <Row label="Requesting Entity" value={d["requesting_entity"]} />
        </div>
      );

    // -----------------------------------------------------------------------
    // 14. Others
    // -----------------------------------------------------------------------
    case "Others":
      return (
        <div>
          <Row label="Purpose Description" value={d["free_text_purpose"]} />
          <Row label="Chief Complaint" value={d["chief_complaint"]} />
        </div>
      );

    default:
      return null;
  }
}
