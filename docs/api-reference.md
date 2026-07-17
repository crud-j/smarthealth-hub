# API Reference

The live, interactive API documentation is available at:

- **Swagger UI:** `http://localhost:8000/api/docs`
- **ReDoc:** `http://localhost:8000/api/redoc`
- **OpenAPI JSON:** `http://localhost:8000/api/openapi.json`

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

All endpoints (except those listed below) require a valid JWT access token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### Public endpoints (no auth required)

| Method | Path | Description |
|---|---|---|
| POST | /auth/login | Credential check — returns OTP challenge |
| POST | /auth/verify-otp | OTP verification — returns access + refresh tokens |
| POST | /auth/resend-otp | Resend OTP SMS |
| POST | /auth/forgot-password | Trigger SMS-based password reset |
| POST | /sms/webhook/delivery-status | Semaphore delivery status callback |

## Endpoint Groups

See the SDP Section 5 (API Design) for full endpoint contracts, request/response schemas, and role access matrices.

| Group | Prefix | Phase |
|---|---|---|
| Authentication | /auth | Phase 1 |
| MFA | /auth | Phase 1 |
| Users | /users | Phase 1 |
| Patients | /patients | Phase 2 |
| Medical History | /medical-history | Phase 2 |
| Immunizations | /immunizations | Phase 2 |
| Appointments | /appointments | Phase 4 |
| Health Cards | /health-cards | Phase 3 |
| Analytics | /analytics | Phase 5 |
| SMS | /sms | Phase 4 |
| Audit Logs | /audit | Phase 6 |
