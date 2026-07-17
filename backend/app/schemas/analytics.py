"""
Pydantic v2 schemas for analytics response serialization.

Schemas to implement (Phase 5):
  - VaccinationCoverageResponse  — by vaccine_name, barangay, age_group, coverage_pct
  - IllnessTrendPoint            — date, illness_name, count
  - NoShowRateResponse           — by provider, month, no_show_rate
  - DemographicBreakdown         — age_group, sex, barangay counts

No PHI in these responses — all data is aggregated.

Full implementation: Phase 5 (Analytics).
"""

# TODO (Phase 5): Implement aggregation response schemas.
