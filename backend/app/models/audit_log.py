"""
Audit log ORM model — append-only, never updated or deleted.

Columns (SDP Section 4 — audit_logs table):
  id, user_id (FK), action (CREATE|UPDATE|DELETE|VIEW_PHI),
  resource_type, resource_id, old_value (JSONB), new_value (JSONB),
  ip_address, user_agent, created_at

This table must be append-only. Enforce at DB level:
  - No UPDATE / DELETE grants for the API service role on this table.
  - Row-level security in PostgreSQL as defense-in-depth.

Full implementation: Phase 6 (Hardening & UAT).
"""

# TODO (Phase 6): Implement with write-only service method (no update/delete service).
