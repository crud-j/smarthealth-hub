# SmartHealth Hub — Passkey (FIDO2/WebAuthn) MFA Implementation Plan

**Date:** 2026-07-25
**Scope:** Replace SMS/Email OTP second factor with FIDO2 WebAuthn Passkeys
**Continues:** Prompt series from `docs/SmartHealth_Hub_Remediation_Plan.md` (Prompts 11–14)
**This document is:** Prompt 15 — Passkey MFA

---

## 1. Current Auth Flow (Baseline)

```
[Login Page]
  email + password
      │
      ▼
POST /auth/login
  ├─ Credential check (Argon2id)
  ├─ Trusted device? → skip OTP → JWT cookies → /dashboard
  └─ Normal path → OTP dispatched via Email/SMS
      │
      ▼
[Verify OTP Page]
  6-digit code + "Remember this device" checkbox
      │
      ▼
POST /auth/verify-otp
  ├─ Argon2id hash check on mfa_otp table
  ├─ Issues JWT access (15min) + refresh (7d) cookies
  └─ Optional: upsert trusted_devices row (30d)
      │
      ▼
/dashboard
```

**Affected files (current):**

| Layer | File |
|---|---|
| Frontend page (step 1) | `frontend/web/app/(auth)/login/page.tsx` |
| Frontend page (step 2) | `frontend/web/app/(auth)/verify-otp/page.tsx` |
| Frontend hooks | `frontend/web/hooks/useAuth.ts` |
| Frontend auth lib | `frontend/web/lib/auth.ts` |
| Backend routes | `backend/app/api/v1/endpoints/auth.py` |
| Backend service | `backend/app/services/auth_service.py` |
| Backend MFA service | `backend/app/services/mfa_service.py` |
| Backend security | `backend/app/core/security.py` |
| Schemas | `backend/app/schemas/auth.py` |
| DB model | `backend/app/models/mfa_otp.py` |
| DB migration | `backend/alembic/versions/0001_initial_schema.py` (mfa_otp table) |

---

## 2. Target: FIDO2 Passkey MFA — Input-Process-Output Analysis

### 2.1 Setup Phase: Registering a Passkey

> Occurs after login (authenticated), inside the user's account settings.

```
[ INPUT ]                   [ PROCESS ]                        [ OUTPUT ]

Authenticated user      →   POST /auth/passkey/register/begin  →   challenge token returned
clicks "Add Passkey"        (server generates FIDO2 challenge,         (stored in Redis, TTL 5min)
                             RP config: rp_id="bhc.local",
                             rp_name="SmartHealth Hub",
                             user entity from DB)

navigator.credentials   →   Device OS prompts: TouchID /        →   Public key + credential_id
.create(options)            Face ID / Windows Hello / PIN            attestation returned to JS

JS sends attestation    →   POST /auth/passkey/register/complete →   passkey_credentials row
to server                   (py_webauthn verifies attestation,        created in DB
                             stores credential_id + public_key +      Success toast shown
                             sign_count + device_name in DB)
```

**Input fields:**
- Authenticated user session (JWT cookie already set)
- Server-generated `publicKeyCredentialCreationOptions`:
  - `rp.id` = `bhc.local` (or `localhost` in dev)
  - `rp.name` = `SmartHealth Hub`
  - `user.id` = user UUID bytes
  - `user.name` = user email
  - `user.displayName` = user full_name
  - `challenge` = 32-byte random bytes (base64url-encoded)
  - `pubKeyCredParams` = `[{ alg: -7, type: "public-key" }]` (ES256)
  - `timeout` = 60000ms
  - `authenticatorSelection.residentKey` = `"preferred"`
  - `authenticatorSelection.userVerification` = `"required"`
  - `attestation` = `"none"` (simplest; direct/indirect needs attestation CA)

**Process (backend `py_webauthn` library):**
1. `frontend` calls `navigator.credentials.create(options)` — OS biometric prompt appears.
2. Device generates a new asymmetric key pair (private key stays on device).
3. Device returns `PublicKeyCredential` with `attestationObject` + `clientDataJSON`.
4. Backend calls `webauthn.verify_registration_response(...)` to validate.
5. Stores `credential_id`, `public_key` (COSE), `sign_count`, `aaguid`, `device_name`.

**Output:**
- `passkey_credentials` DB row inserted.
- Audit log: `action="PASSKEY_REGISTERED"`.
- Frontend success toast: "Passkey added. You can now use it to sign in."

---

### 2.2 Authentication Phase: Signing In with a Passkey

> Replaces the OTP step. The user types their email, clicks "Sign in with Passkey",
> and uses their device biometric — no OTP required.

```
[ INPUT ]                   [ PROCESS ]                        [ OUTPUT ]

User enters email       →   POST /auth/passkey/authenticate/begin  →  challenge + allowedCredentials
clicks "Sign in with        (server fetches credential_ids for          returned to frontend
Passkey" button             this user, generates challenge,
                             stores in Redis TTL 2min)

navigator.credentials   →   Device OS prompts: TouchID /         →   Signed assertion
.get(options)               Face ID / Windows Hello / PIN            (clientDataJSON +
                             (private key signs the challenge)        authenticatorData +
                                                                      signature)

JS sends assertion      →   POST /auth/passkey/authenticate/complete  →  JWT access + refresh
to server                   (py_webauthn verifies signature               cookies set
                             against stored public_key,                  Redirect → /dashboard
                             checks sign_count > stored count,
                             updates sign_count + last_used_at)
```

**Input fields:**
- `user_identifier` (email) → backend looks up `passkey_credentials` by user
- Server-generated `publicKeyCredentialRequestOptions`:
  - `challenge` = 32-byte random bytes (stored in Redis)
  - `timeout` = 60000ms
  - `rpId` = `bhc.local`
  - `allowCredentials` = list of `{ type: "public-key", id: credential_id }` for this user
  - `userVerification` = `"required"` (forces biometric/PIN on every use)

**Process (backend):**
1. Frontend calls `navigator.credentials.get(options)`.
2. User performs biometric; device signs challenge with private key.
3. Backend calls `webauthn.verify_authentication_response(...)`.
4. Validates signature against stored `public_key`.
5. Validates `sign_count > stored count` (prevents cloned authenticator replay).
6. Updates `sign_count` and `last_used_at`.
7. Issues JWT tokens (same as OTP flow).

**Output:**
- JWT `access_token` (15min) + `refresh_token` (7d) cookies set.
- Audit log: `action="PASSKEY_LOGIN"`.
- Frontend redirected to `/dashboard`.

---

## 3. Architecture: New Files and Changed Files

### 3.1 New Files

| File | Purpose |
|---|---|
| `backend/app/models/passkey_credential.py` | SQLAlchemy ORM model for `passkey_credentials` table |
| `backend/app/schemas/passkey.py` | Pydantic v2 request/response schemas |
| `backend/app/services/passkey_service.py` | Business logic: begin/complete register and authenticate |
| `backend/app/api/v1/endpoints/passkey.py` | 4 FastAPI routes |
| `backend/alembic/versions/0011_passkey_credentials.py` | DB migration |
| `frontend/web/app/(dashboard)/settings/security/page.tsx` | "Manage Passkeys" settings page |
| `frontend/web/lib/passkey.ts` | `navigator.credentials` wrappers (typed helpers) |
| `backend/tests/test_passkey.py` | Backend tests |

### 3.2 Modified Files

| File | Change |
|---|---|
| `backend/app/api/v1/__init__.py` or `main.py` | Register passkey router |
| `backend/app/models/__init__.py` | Export `PasskeyCredential` model |
| `frontend/web/app/(auth)/login/page.tsx` | Add "Sign in with Passkey" button + passkey flow |
| `frontend/web/app/(auth)/verify-otp/page.tsx` | Add "Use Passkey instead" link |
| `frontend/web/hooks/useAuth.ts` | Add `usePasskeyAuth` hook |
| `backend/.env.example` | Add `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN` |
| `backend/app/core/config.py` | Add `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN` settings |
| `backend/pyproject.toml` | Add `py_webauthn>=2.0` dependency |

---

## 4. Database Schema: `passkey_credentials` Table

```sql
-- Migration: 0011_passkey_credentials.py

CREATE TABLE passkey_credentials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id   BYTEA NOT NULL UNIQUE,   -- FIDO2 credential identifier
    public_key      BYTEA NOT NULL,           -- COSE-encoded public key
    sign_count      BIGINT NOT NULL DEFAULT 0, -- monotonic counter (replay protection)
    aaguid          VARCHAR(36),              -- authenticator AAGUID (device type hint)
    device_name     VARCHAR(100) NOT NULL DEFAULT 'My Passkey', -- user label
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ
);

CREATE INDEX idx_passkey_user_id ON passkey_credentials(user_id);
CREATE INDEX idx_passkey_credential_id ON passkey_credentials(credential_id);
```

**Relationship:** `User` has many `PasskeyCredential` (one per device/account).

---

## 5. Backend API Routes

All 4 routes live in `backend/app/api/v1/endpoints/passkey.py`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/passkey/register/begin` | JWT required | Generate registration challenge |
| `POST` | `/auth/passkey/register/complete` | JWT required | Verify attestation, store credential |
| `POST` | `/auth/passkey/authenticate/begin` | Public | Generate auth challenge for user |
| `POST` | `/auth/passkey/authenticate/complete` | Public | Verify assertion, issue JWT |

**Note:** The `/register` routes are protected (user must already be logged in via OTP or existing passkey to add a new one). The `/authenticate` routes are public (these ARE the login mechanism).

---

## 6. Environment Variables

Add to `backend/.env.example` and `backend/.env`:

```bash
# WebAuthn / Passkey configuration
# WEBAUTHN_RP_ID must match the domain the app is served from (no port).
# Use "localhost" for local development, "bhc.local" for LAN deployment.
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_NAME=SmartHealth Hub
# WEBAUTHN_ORIGIN is the full origin including scheme + port.
WEBAUTHN_ORIGIN=http://localhost:3000
```

---

## 7. Frontend: Login Page Changes

The login page gains a second authentication path:

```
[Login Page — updated]
  ┌─────────────────────────────────────────────┐
  │  Email: [staff@bhc.local          ]         │
  │  Password: [••••••••              ]          │
  │                                             │
  │  [ Continue ] (OTP flow — existing)         │
  │  ─── or ───                                 │
  │  [ 🔑 Sign in with Passkey ]                │
  │  (appears only if WebAuthn supported)       │
  └─────────────────────────────────────────────┘
```

**Logic:**
1. Check `"PublicKeyCredential" in window` — if false, hide the passkey button.
2. "Sign in with Passkey" → POST `/auth/passkey/authenticate/begin` with the email.
3. Call `navigator.credentials.get(options)` — OS biometric prompt.
4. POST result to `/auth/passkey/authenticate/complete`.
5. On success: redirect to `/dashboard` directly (no OTP page).
6. On failure (no passkeys registered, biometric rejected): show error + keep OTP path visible.

---

## 8. Frontend: Security Settings Page

Route: `frontend/web/app/(dashboard)/settings/security/page.tsx`

```
[Settings > Security]
  ┌─────────────────────────────────────────────┐
  │ Passkeys                                    │
  │ Sign in faster with biometrics or device PIN│
  │                                             │
  │ [ + Add Passkey ]                           │
  │                                             │
  │ My Passkeys:                                │
  │ ┌────────────────────────────────────────┐  │
  │ │ 🔑 iPhone (Touch ID)  Added 2026-07-25 │  │
  │ │                           [ Remove ]   │  │
  │ │ 🔑 Windows Hello       Added 2026-07-20│  │
  │ │                           [ Remove ]   │  │
  │ └────────────────────────────────────────┘  │
  └─────────────────────────────────────────────┘
```

---

## 9. Browser Compatibility

| Browser / OS | Passkey Support | Notes |
|---|---|---|
| Chrome (Android) | ✅ Full | Google Password Manager sync |
| Chrome (Windows) | ✅ Full | Windows Hello |
| Safari (iOS 16+) | ✅ Full | iCloud Keychain sync |
| Safari (macOS Ventura+) | ✅ Full | Touch ID |
| Firefox | ⚠️ Partial | Hardware keys only; no platform biometric |
| Edge (Windows) | ✅ Full | Windows Hello |

**BHC Context:** Most BHC staff use Chrome on Android. Show a fallback notice for Firefox:
> "Passkeys are not fully supported in this browser. Please use Chrome or Safari,
> or sign in with your email OTP instead."

**Important:** The SMS/Email OTP path **must remain available** as a fallback for:
- Devices that don't support biometrics (older Android)
- Users who haven't registered a passkey yet
- Password-reset flows (passkeys cannot reset passwords)

---

## 10. Security Considerations

| Risk | Mitigation |
|---|---|
| Replay attack | `sign_count` monotonic counter checked on every auth |
| Challenge reuse | Challenge stored in Redis with 2-min TTL; deleted after use |
| Credential cloning | `sign_count` check rejects authenticators with stale counter |
| MITM | `origin` and `rpId` are verified by `py_webauthn` — must match server config |
| PHI leakage | No PHI in passkey credential; only credential_id + public_key stored |
| Audit trail | Every passkey registration, use, and removal writes audit_logs |
| Lost device | User can revoke individual credentials from settings page; OTP remains as fallback |

---

## 11. Step-by-Step Implementation Prompts

These are **Prompt 15** in the series (continuing from Remediation Plan Prompts 11–14).
Run them in order.

---

### Prompt 15A — Backend: Database, Models, Schemas, Service

**Dependencies:** Prompts 11–14 complete (JWT shape, audit log, Redis pool all in place).
**Closes:** Setup Phase (2.1) and Authentication Phase (2.2) backend.

```
Act as the smarthealth-hub-architect agent, working in backend/.

Reference docs/Passkey_MFA_Implementation_Plan.md Section 4 (DB schema),
Section 5 (API routes), and Section 6 (env vars).

Add the py_webauthn library and implement the backend passkey foundation.

1. Dependency
   - In backend/pyproject.toml, add:
       "py_webauthn>=2.2.0"
   - Run: pip install py_webauthn

2. Environment config
   - In app/core/config.py (Settings class), add:
       WEBAUTHN_RP_ID: str = "localhost"
       WEBAUTHN_RP_NAME: str = "SmartHealth Hub"
       WEBAUTHN_ORIGIN: str = "http://localhost:3000"
   - Add these to backend/.env.example with the comments from Section 6.

3. Database migration: 0011_passkey_credentials.py
   - Create backend/alembic/versions/0011_passkey_credentials.py
   - revision = "0011", down_revision = "0010"
   - Upgrade: CREATE TABLE passkey_credentials exactly as in Section 4.
     All columns: id (UUID PK), user_id (UUID FK users CASCADE),
     credential_id (BYTEA UNIQUE NOT NULL), public_key (BYTEA NOT NULL),
     sign_count (BIGINT NOT NULL DEFAULT 0), aaguid (VARCHAR 36),
     device_name (VARCHAR 100 NOT NULL DEFAULT 'My Passkey'),
     is_active (BOOLEAN NOT NULL DEFAULT TRUE),
     created_at (TIMESTAMPTZ NOT NULL DEFAULT NOW()),
     last_used_at (TIMESTAMPTZ nullable).
   - Create indexes: idx_passkey_user_id, idx_passkey_credential_id.
   - Downgrade: DROP TABLE passkey_credentials CASCADE.

4. SQLAlchemy model: app/models/passkey_credential.py
   - Class PasskeyCredential(Base), __tablename__ = "passkey_credentials".
   - All columns matching the migration.
   - Relationship: user: Mapped["User"] = relationship("User",
     back_populates="passkey_credentials", lazy="noload").
   - Add the back-reference to User model in app/models/user.py:
     passkey_credentials: Mapped[list["PasskeyCredential"]] = relationship(
       "PasskeyCredential", back_populates="user",
       lazy="noload", cascade="all, delete-orphan"
     )
   - Export from app/models/__init__.py.

5. Pydantic schemas: app/schemas/passkey.py
   All Pydantic v2 models:
   - PasskeyRegisterBeginRequest: device_name (str, default "My Passkey", max 100)
   - PasskeyRegisterBeginResponse: options (dict) — the JSON-serializable
     PublicKeyCredentialCreationOptions dict from py_webauthn
   - PasskeyRegisterCompleteRequest: credential (dict) — the raw JSON from
     navigator.credentials.create() serialized via JSON.stringify()
   - PasskeyRegisterCompleteResponse: id (UUID), device_name (str),
     created_at (datetime), message (str)
   - PasskeyAuthBeginRequest: email (str)
   - PasskeyAuthBeginResponse: options (dict) — PublicKeyCredentialRequestOptions
   - PasskeyAuthCompleteRequest: credential (dict), email (str)
   - PasskeyCredentialInfo: id (UUID), device_name (str), aaguid (str|None),
     created_at (datetime), last_used_at (datetime|None), is_active (bool)
   - PasskeyListResponse: credentials (list[PasskeyCredentialInfo])

6. Service: app/services/passkey_service.py
   Import: from webauthn import (generate_registration_options,
     verify_registration_response, generate_authentication_options,
     verify_authentication_response)
   Import: from webauthn.helpers.structs import (
     PublicKeyCredentialDescriptor, UserVerificationRequirement,
     AuthenticatorSelectionCriteria, ResidentKeyRequirement)
   Import: from webauthn.helpers import bytes_to_base64url, base64url_to_bytes

   a) begin_registration(db, user_id, device_name) -> dict
      - Load user from DB (need email + full_name).
      - Generate challenge: secrets.token_bytes(32).
      - Call generate_registration_options(
          rp_id=settings.WEBAUTHN_RP_ID,
          rp_name=settings.WEBAUTHN_RP_NAME,
          user_id=str(user.id).encode(),
          user_name=user.email,
          user_display_name=user.full_name,
          challenge=challenge,
          authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
          ),
          timeout=60000,
        )
      - Store challenge in Redis: key="passkey:reg:{user_id}", value=base64url(challenge), TTL=300s.
      - Return options as dict (use options_to_json() or __dict__ from py_webauthn).

   b) complete_registration(db, user_id, credential_dict, device_name) -> PasskeyCredential
      - Retrieve challenge from Redis key "passkey:reg:{user_id}"; if missing → raise ValidationError.
      - Delete the Redis key immediately (one-time use).
      - Call verify_registration_response(
          credential=credential_dict,
          expected_challenge=base64url_to_bytes(stored_challenge),
          expected_rp_id=settings.WEBAUTHN_RP_ID,
          expected_origin=settings.WEBAUTHN_ORIGIN,
          require_user_verification=True,
        )
      - On success: create PasskeyCredential row with
          credential_id=verification.credential_id,
          public_key=verification.credential_public_key,
          sign_count=verification.sign_count,
          aaguid=str(verification.aaguid) if verification.aaguid else None,
          device_name=device_name.
      - Write audit log: action="PASSKEY_REGISTERED".
      - Return the saved PasskeyCredential.

   c) begin_authentication(db, email) -> dict
      - Load user by email. If not found or inactive → raise UnauthorizedError
        (use generic message to prevent email enumeration).
      - Fetch all is_active=True passkey_credentials for user_id.
      - If none: raise UnauthorizedError("No passkeys registered. Use email OTP to sign in.")
      - Generate challenge: secrets.token_bytes(32).
      - Build allow_credentials list from credential_ids.
      - Call generate_authentication_options(
          rp_id=settings.WEBAUTHN_RP_ID,
          allow_credentials=[PublicKeyCredentialDescriptor(id=c.credential_id)
                             for c in credentials],
          challenge=challenge,
          timeout=60000,
          user_verification=UserVerificationRequirement.REQUIRED,
        )
      - Store in Redis: key="passkey:auth:{user_id}", value=base64url(challenge), TTL=120s.
        Also store user_id: key="passkey:auth:uid:{challenge_b64}", value=str(user_id), TTL=120s.
      - Return options as dict.

   d) complete_authentication(db, email, credential_dict) -> (str, str)
      - Load user by email.
      - Retrieve credential_id from credential_dict["id"] (base64url).
      - Retrieve the PasskeyCredential row by credential_id. If not found → UnauthorizedError.
      - Retrieve challenge from Redis key "passkey:auth:{user_id}". If missing → UnauthorizedError.
      - Delete the Redis key immediately.
      - Call verify_authentication_response(
          credential=credential_dict,
          expected_challenge=base64url_to_bytes(stored_challenge),
          expected_rp_id=settings.WEBAUTHN_RP_ID,
          expected_origin=settings.WEBAUTHN_ORIGIN,
          credential_public_key=passkey_row.public_key,
          credential_current_sign_count=passkey_row.sign_count,
          require_user_verification=True,
        )
      - Update passkey_row.sign_count = verification.new_sign_count.
      - Update passkey_row.last_used_at = now().
      - Issue tokens: access_token = create_access_token(str(user.id), user.role.name)
                     refresh_token = create_refresh_token(str(user.id))
      - Update user.refresh_token_hash = SHA256(refresh_token).
      - Update user.last_login_at = now().
      - Write audit log: action="PASSKEY_LOGIN".
      - Return (access_token, refresh_token).

   e) list_credentials(db, user_id) -> list[PasskeyCredential]
      - Return all is_active=True rows for user_id, ordered by created_at DESC.

   f) revoke_credential(db, user_id, credential_id, revoked_by) -> None
      - Fetch row by id WHERE user_id matches (prevents IDOR).
      - Set is_active=False.
      - Write audit log: action="PASSKEY_REVOKED".

7. Routes: app/api/v1/endpoints/passkey.py
   router = APIRouter(prefix="/auth/passkey", tags=["passkey"])

   POST /auth/passkey/register/begin   → require CurrentUser → begin_registration
   POST /auth/passkey/register/complete → require CurrentUser → complete_registration
   POST /auth/passkey/authenticate/begin → public → begin_authentication
   POST /auth/passkey/authenticate/complete → public → complete_authentication
                                              → set cookies via _set_auth_cookies
                                              → return TokenResponse
   GET  /auth/passkey/credentials      → require CurrentUser → list_credentials
   DELETE /auth/passkey/credentials/{id} → require CurrentUser → revoke_credential

   Register the router in backend/app/api/v1/router.py (NOT main.py).
   Add: from app.api.v1.endpoints import passkey
        api_router.include_router(passkey.router)
   alongside the existing auth and other sub-router registrations.

IMPORTANT — two cross-cutting concerns to resolve in this prompt:

A. _set_auth_cookies is a private function in auth.py and cannot be imported
   into passkey.py without moving it. Move _set_auth_cookies and _clear_auth_cookies
   to a new module: app/api/v1/endpoints/_cookies.py (or app/core/cookies.py).
   Update auth.py to import from there. The passkey router then imports the same
   helper. Do not duplicate the cookie logic.

B. Rate limiting: the public endpoints POST /auth/passkey/authenticate/begin and
   POST /auth/passkey/authenticate/complete are high-value targets. Apply the
   existing limiter.check_rate_limit() pattern (from app/core/rate_limit.py):
     - authenticate/begin: 10 req/min per IP
     - authenticate/complete: 10 req/min per IP

Do NOT touch the frontend in this prompt.
```

---

### Prompt 15B — Frontend: Login Page + Passkey Library + Settings Page

**Dependencies:** Prompt 15A complete and migrated (0011 must be applied).
**Closes:** Authentication Phase (2.2) frontend, Setup Phase (2.1) frontend.

```
Act as the smarthealth-hub-architect agent, working in frontend/web/.

Reference docs/Passkey_MFA_Implementation_Plan.md Sections 7, 8, and 9.

Implement the frontend passkey integration.

1. Passkey helper library: frontend/web/lib/passkey.ts
   New file. All functions are thin wrappers around the WebAuthn browser API.
   Do NOT install any npm packages — use navigator.credentials directly.

   a) isPasskeySupported(): boolean
      return typeof window !== "undefined" && "PublicKeyCredential" in window;

   b) startPasskeyRegistration(options: PublicKeyCredentialCreationOptionsJSON):
        Promise<RegistrationResponseJSON>
      - Accept the JSON options dict from the server (strings, not ArrayBuffers).
      - Convert challenge and user.id from base64url to ArrayBuffer.
      - Call navigator.credentials.create({ publicKey: converted_options }).
      - Convert response (clientDataJSON, attestationObject, etc.) back to base64url strings.
      - Return plain JSON object for POSTing to /auth/passkey/register/complete.

   c) startPasskeyAuthentication(options: PublicKeyCredentialRequestOptionsJSON):
        Promise<AuthenticationResponseJSON>
      - Accept the JSON options dict from the server.
      - Convert challenge and allowCredentials[].id from base64url to ArrayBuffer.
      - Call navigator.credentials.get({ publicKey: converted_options }).
      - Convert response back to base64url strings.
      - Return plain JSON for POSTing to /auth/passkey/authenticate/complete.

   Helper: base64urlToBuffer(s: string): ArrayBuffer and bufferToBase64url(buf: ArrayBuffer): string
   — implement with atob/btoa and Uint8Array.

2. Update frontend/web/app/(auth)/login/page.tsx
   - Below the existing "Continue" (OTP) submit button, add:
       {isPasskeySupported() && (
         <>
           <div style={orDividerStyle}>or</div>
           <button
             type="button"
             onClick={handlePasskeyLogin}
             style={passkeyButtonStyle}
             disabled={isLoading}
           >
             {isPasskeyLoading ? "Verifying…" : "🔑 Sign in with Passkey"}
           </button>
         </>
       )}
   - Add state: const [isPasskeyLoading, setIsPasskeyLoading] = useState(false)
   - Implement handlePasskeyLogin():
       a. Validate email field (non-empty, basic format). Show fieldErrors.email if fails.
       b. POST to /auth/passkey/authenticate/begin with { email }.
       c. Call startPasskeyAuthentication(options).
       d. POST result + email to /auth/passkey/authenticate/complete.
       e. On success: tokens are in JWT cookies — redirect to /dashboard.
       f. On error: set apiError state (passkey not registered, biometric rejected, etc.).
   - If the server returns 404 ("No passkeys registered"):
     show a friendly message: "No passkey found for this account.
     Use the OTP flow to sign in, then add a passkey in Settings."
   - Import isPasskeySupported and startPasskeyAuthentication from ../../../lib/passkey.

3. Update frontend/web/app/(auth)/verify-otp/page.tsx
   - Below the OTP input section, add a subtle link (below the "Back to sign in" link):
       {isPasskeySupported() && (
         <div style={{ textAlign: "center", marginTop: "0.75rem" }}>
           <a href="/login" style={subtleLinkStyle}>
             Try signing in with a passkey instead
           </a>
         </div>
       )}
   - This is display-only — no new logic, just a link back to /login.

4. New page: frontend/web/app/(dashboard)/settings/security/page.tsx
   "Manage Passkeys" — show after successful OTP login in Settings sidebar.
   Layout follows the existing settings pages pattern.

   State:
   - passkeys: list of PasskeyCredentialInfo (from GET /auth/passkey/credentials)
   - isLoading: boolean
   - isRegistering: boolean
   - error: string | null
   - successMsg: string | null

   Display:
   - Page heading: "Security — Passkeys"
   - Subheading: "Passkeys let you sign in with your fingerprint, face, or device PIN."
   - Browser support notice (if !isPasskeySupported()):
       "Passkeys require Chrome, Safari, or Edge. This browser is not supported."
   - "Add Passkey" button → handleAddPasskey():
       a. Prompt user for device name via window.prompt("Name this passkey:", "My Passkey").
          (A proper modal is a Low priority polish item; prompt is acceptable for now.)
       b. POST to /auth/passkey/register/begin with { device_name }.
       c. Call startPasskeyRegistration(options).
       d. POST result + device_name to /auth/passkey/register/complete.
       e. On success: show successMsg, refetch passkey list.
       f. On error: show error banner (user cancelled biometric → generic "Registration
          was cancelled or failed." message).
   - Passkey list table: columns: Device name, Added on, Last used, Actions.
   - Per-row "Remove" button → confirmation dialog → DELETE /auth/passkey/credentials/{id}.
   - Empty state: "No passkeys registered. Click 'Add Passkey' to get started."

5. Sidebar link
   The sidebar is in frontend/web/components/layout/Sidebar.tsx.
   Nav links are in the NAV_ITEMS array (around line 111).
   Add a "Security" entry pointing to /settings/security with roles: []
   (all roles can manage their own passkeys). Place it in the settings group,
   after the existing Profile entry. Use a shield SVG icon inline.

6. Add apiFetch call helpers in frontend/web/lib/auth.ts (or a new passkey section):
   - passkeyRegisterBegin(device_name: string): Promise<{options: object}>
   - passkeyRegisterComplete(credential: object, device_name: string): Promise<PasskeyCredentialInfo>
   - passkeyAuthBegin(email: string): Promise<{options: object}>
   - passkeyAuthComplete(credential: object, email: string): Promise<TokenResponse>
   - listPasskeys(): Promise<PasskeyCredentialInfo[]>
   - revokePasskey(id: string): Promise<void>

Do NOT modify backend files in this prompt.
```

---

### Prompt 15C — Tests and Documentation

**Dependencies:** Prompts 15A and 15B complete.
**Closes:** Test coverage for passkey backend.

```
Act as the smarthealth-hub-architect agent, working in backend/tests/.

Write backend tests for the passkey feature. Do NOT mock the WebAuthn verification
library — use py_webauthn's built-in test helpers or create minimal fake credentials.

File: tests/test_passkey.py

1. Fixture: create a test user + simulated passkey credential row
   (insert directly via DB session, bypassing the registration ceremony
   since we cannot invoke a real biometric in CI).
   Use realistic BYTEA values for credential_id (32 random bytes) and
   public_key (a static ES256 key from py_webauthn's test suite).

2. Test: GET /auth/passkey/credentials — returns empty list when no passkeys.
3. Test: POST /auth/passkey/register/begin — requires auth → 401 without JWT.
4. Test: POST /auth/passkey/register/begin — authenticated → returns dict with
   "challenge" key.
5. Test: POST /auth/passkey/register/complete — with invalid credential dict
   → 422 validation error (bad payload shape).
6. Test: POST /auth/passkey/authenticate/begin — with non-existent email
   → 401 (generic message, not "user not found").
7. Test: POST /auth/passkey/authenticate/begin — for user with no credentials
   → 401 with "No passkeys registered" message.
8. Test: DELETE /auth/passkey/credentials/{id} — own credential → 204.
9. Test: DELETE /auth/passkey/credentials/{id} — another user's credential
   → 403 (IDOR prevention).
10. Test: Audit log row exists after successful revocation.

Also update docs/deployment-readiness.md:
   - Add "Passkey MFA" to the in-progress features section.
   - Note that Prompt 15 (A/B/C) implements FIDO2 Passkey as a second-factor
     replacement for SMS OTP.
```

---

## 12. Execution Order

```
Prompt 15A (Backend: DB + models + schemas + service + routes)
    ↓
    Run: alembic upgrade head
    Run: pip install py_webauthn
    ↓
Prompt 15B (Frontend: login page + passkey lib + settings page)
    ↓
Prompt 15C (Backend tests + docs update)
```

---

## 13. What Is NOT Changed by This Plan

| Item | Reason unchanged |
|---|---|
| `POST /auth/login` | Password + OTP path kept as fallback |
| `POST /auth/verify-otp` | OTP path kept for non-passkey devices |
| `POST /auth/resend-otp` | Unchanged |
| `POST /auth/forgot-password` | Passkeys cannot reset passwords — OTP required here |
| JWT shape (access + refresh cookies) | Passkey auth issues the same JWT format |
| `trusted_devices` table | Unchanged — separate UX convenience feature |
| Redis pool (`get_shared_redis()`) | Passkey service reuses the same pool |
| `audit_logs` | Unchanged — passkey service writes to it |

---

## 14. Dependencies (npm / pip)

| Library | Version | Purpose |
|---|---|---|
| `py_webauthn` | `>=2.2.0` | Backend FIDO2 registration + authentication verification |
| (none) | — | Frontend uses native `navigator.credentials` API only |

---

*Generated by SmartHealth Hub Architect agent context — 2026-07-25*
