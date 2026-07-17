# ISO 25010 UAT Evaluation Form

**System Under Test:** SmartHealth Hub — Integrated Health Care Information Management System  
**Evaluation Standard:** ISO/IEC 25010:2011 Systems and Software Quality Requirements and Evaluation  
**Target Respondents:** BHWs, Physicians/Nurses/Midwives, Admin Staff, BHC Head  

---

## Quality Characteristics

### 1. Functional Suitability

| # | Test Scenario | Expected Result | Actual Result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| 1.1 | Register a new patient with complete demographic data | Patient record created, health card PDF generated | | | |
| 1.2 | Schedule an appointment and verify SMS reminder received | SMS delivered within 1 minute of scheduled_at - lead_hours | | | |
| 1.3 | Scan QR code on health card and retrieve patient record | Patient record loaded in < 3 seconds | | | |
| 1.4 | Record a vaccination and verify it appears in immunization report | Record persisted, visible in analytics dashboard | | | |
| 1.5 | Login with valid credentials + OTP, verify MFA enforced | Access granted only after correct OTP | | | |

### 2. Performance Efficiency

| # | Metric | Target | Measured | Pass/Fail |
|---|---|---|---|---|
| 2.1 | Patient search response time | < 2 seconds (p95) | | |
| 2.2 | Health card PDF generation time | < 5 seconds | | |
| 2.3 | Dashboard analytics load time | < 3 seconds | | |
| 2.4 | Concurrent users without degradation | 50 concurrent users | | |

### 3. Usability

| # | Criterion | Rating (1-5) | Notes |
|---|---|---|---|
| 3.1 | Ease of patient registration for BHW with limited IT experience | | |
| 3.2 | Clarity of SMS reminder messages (Filipino language) | | |
| 3.3 | Navigation intuitiveness for all user roles | | |
| 3.4 | Accessibility for senior/PWD users (font size, contrast) | | |

### 4. Reliability

| # | Scenario | Expected | Result |
|---|---|---|---|
| 4.1 | SMS fails — core clinical workflow continues | No error blocking patient visit recording | |
| 4.2 | Network interruption during card generation | Graceful error, data not corrupted | |

### 5. Security

| # | Test | Expected | Result |
|---|---|---|---|
| 5.1 | BHW cannot access encrypted diagnosis fields | 403 Forbidden | |
| 5.2 | QR code contains no PHI | QR payload: patient_id + version + HMAC only | |
| 5.3 | Audit log records all PHI write operations | Audit log entry present for each change | |
| 5.4 | Invalid OTP rejected, account locked after 5 attempts | Lock triggered at attempt 5 | |

### 6. Maintainability

| # | Criterion | Rating (1-5) | Notes |
|---|---|---|---|
| 6.1 | Code is well-structured and documented | | |
| 6.2 | DB migrations apply without manual intervention | | |

---

## Evaluator Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| BHC Head | | | |
| Lead Physician | | | |
| BHW Representative | | | |
| Thesis Adviser | | | |

---

*This form will be finalized in Phase 6 (Hardening & UAT).*
