"""
Audit logging service — append-only write to audit_logs table.

Usage in endpoint / service layer:
  await audit_service.log(
      user_id=current_user.id,
      action="UPDATE",
      resource_type="patient",
      resource_id=patient.id,
      old_value=old_dict,
      new_value=new_dict,
      request=request,
  )

This service has no update or delete methods by design.

Full implementation: Phase 6 (Hardening & UAT), but audit_service.log()
stubs should be called throughout earlier phases.
"""

# TODO (Phase 6): Implement AuditService.log() async method.
# NOTE: Wire preliminary call sites in Phase 2+ even before full implementation.
