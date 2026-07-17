# Entity-Relationship Diagram

See **Section 4 (Database Design)** of the System Development Plan for the full ER diagram and table definitions:

`docs/SmartHealth_Hub_System_Development_Plan.md`

## Tables Summary

| Table | Description |
|---|---|
| users | System users (Admin, BHW, Physician/Nurse/Midwife, Admin Staff) |
| patients | Patient demographics and contact information |
| medical_history | Patient medical history entries (notes encrypted at rest) |
| immunizations | Vaccination records per patient |
| appointments | Scheduled appointments with SMS reminder tracking |
| visits | Clinical visit records (diagnosis/treatment_notes encrypted) |
| health_cards | NFC/QR card issuance history |
| mfa_otps | SMS OTP tokens for 2FA (hashed, single-use, TTL) |
| sms_logs | Outbound SMS dispatch log from Semaphore API |
| audit_logs | Append-only audit trail for all write operations on PHI |

## Visual Diagram

A visual ER diagram (PNG/SVG) will be generated from the Alembic-managed schema using `eralchemy2` or `pgAdmin` export in Phase 1.
