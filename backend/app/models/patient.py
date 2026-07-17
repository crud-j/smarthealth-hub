"""
Patient ORM model.

Columns (SDP Section 4 — patients table):
  id, patient_code (unique), first_name, last_name, middle_name,
  birth_date, sex, civil_status, address, barangay, contact_number,
  guardian_name, guardian_contact, blood_type, is_active,
  created_at, updated_at, created_by_id

Full implementation: Phase 2 (Patient Records).
"""

# TODO (Phase 2): Implement with relationship to MedicalHistory, Immunization,
#   Appointment, Visit, and HealthCard models.
