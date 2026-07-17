"""
Analytics endpoints — real-time BHC health metrics.

  GET /analytics/vaccination-coverage     — by vaccine type, barangay, age group
  GET /analytics/illness-trends           — illness frequency over time
  GET /analytics/appointment-no-shows     — no-show rate by provider / month
  GET /analytics/demographics             — patient age/sex/barangay breakdown
  GET /analytics/sms-delivery             — SMS success/failure rates

All analytics are aggregated; no raw PHI is returned from these endpoints.

Full implementation: Phase 5 (Analytics).
"""

from fastapi import APIRouter

router = APIRouter()

# TODO (Phase 5): Implement aggregation queries and caching layer.
