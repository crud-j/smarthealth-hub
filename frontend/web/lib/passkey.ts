/**
 * WebAuthn / Passkey browser API wrappers.
 *
 * Zero npm dependencies — uses native browser APIs only.
 * Safe to import from "use client" components: no window access at module level.
 */

// ---------------------------------------------------------------------------
// Shared type (re-exported so callers can use it without importing from auth.ts)
// ---------------------------------------------------------------------------

export interface PasskeyCredentialInfo {
  id: string;
  device_name: string;
  aaguid: string | null;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

/**
 * Returns true when the browser supports the WebAuthn / Passkeys API.
 * Must be called at render time (inside a component or effect), not at module
 * level, because `window` is not available during SSR.
 */
export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window;
}

// ---------------------------------------------------------------------------
// base64url ↔ ArrayBuffer helpers
// ---------------------------------------------------------------------------

function base64urlToBuffer(base64url: string): ArrayBuffer {
  // Replace URL-safe characters and pad to a multiple of 4.
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  );
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ---------------------------------------------------------------------------
// Registration ceremony
// ---------------------------------------------------------------------------

/**
 * Convert server-issued creation options, invoke the browser authenticator,
 * and return a plain JSON-serializable attestation object to POST to
 * POST /auth/passkey/register/complete.
 *
 * @param options  Raw options object from POST /auth/passkey/register/begin.
 *                 `challenge`, `user.id`, and each `excludeCredentials[].id`
 *                 must be base64url-encoded strings (as the server sends them).
 * @throws         `Error` with `name === "NotAllowedError"` when the user
 *                 cancels or times out the authenticator prompt.
 */
export async function startPasskeyRegistration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebAuthn options come as opaque server payload
  options: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const publicKey: PublicKeyCredentialCreationOptions = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- spreading heterogeneous server object
    ...(options as any),
    challenge: base64urlToBuffer(options.challenge as string),
    user: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(options.user as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      id: base64urlToBuffer((options.user as any).id as string),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    excludeCredentials: ((options.excludeCredentials as any[]) ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => ({
        ...c,
        id: base64urlToBuffer(c.id as string),
      })
    ),
  };

  const credential = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Passkey registration cancelled.");

  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      attestationObject: bufferToBase64url(response.attestationObject),
      // `getTransports` is defined in the spec but may be absent in older browsers.
      transports: response.getTransports ? response.getTransports() : [],
    },
  };
}

// ---------------------------------------------------------------------------
// Authentication ceremony
// ---------------------------------------------------------------------------

/**
 * Convert server-issued request options, invoke the browser authenticator,
 * and return a plain JSON-serializable assertion object to POST to
 * POST /auth/passkey/authenticate/complete.
 *
 * @param options  Raw options object from POST /auth/passkey/authenticate/begin.
 *                 `challenge` and each `allowCredentials[].id` must be
 *                 base64url-encoded strings (as the server sends them).
 * @throws         `Error` with `name === "NotAllowedError"` when the user
 *                 cancels or times out the authenticator prompt.
 */
export async function startPasskeyAuthentication(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebAuthn options come as opaque server payload
  options: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const publicKey: PublicKeyCredentialRequestOptions = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(options as any),
    challenge: base64urlToBuffer(options.challenge as string),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allowCredentials: ((options.allowCredentials as any[]) ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => ({
        ...c,
        id: base64urlToBuffer(c.id as string),
      })
    ),
  };

  const credential = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Passkey authentication cancelled.");

  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      authenticatorData: bufferToBase64url(response.authenticatorData),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle
        ? bufferToBase64url(response.userHandle)
        : null,
    },
  };
}
