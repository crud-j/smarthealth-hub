"use client";

import { useEffect, useState } from "react";
import {
  listPasskeys, passkeyRegisterBegin, passkeyRegisterComplete, revokePasskey, type PasskeyCredentialInfo,
} from "../../../../lib/auth";
import { isPasskeySupported, startPasskeyRegistration } from "../../../../lib/passkey";
import { toast } from "@/lib/toast";
import { AlertDialog } from "@/components/ui/alert-dialog";

export default function SecurityPage() {
  const [passkeys, setPasskeys] = useState<PasskeyCredentialInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [revokeInProgress, setRevokeInProgress] = useState(false);

  useEffect(() => { setPasskeySupported(isPasskeySupported()); }, []);

  async function fetchPasskeys() {
    try { const { credentials } = await listPasskeys(); setPasskeys(credentials); }
    catch { toast.error("Failed to load passkeys."); }
    finally { setIsLoading(false); }
  }

  useEffect(() => { void fetchPasskeys(); }, []);

  async function handleAddPasskey() {
    const deviceName = window.prompt("Name this passkey (e.g. iPhone, Windows Hello):", "My Passkey");
    if (deviceName === null) return;
    const trimmedName = deviceName.trim() || "My Passkey";
    setIsRegistering(true);
    try {
      const { options } = await passkeyRegisterBegin(trimmedName);
      const attestation = await startPasskeyRegistration(options);
      await passkeyRegisterComplete(attestation, trimmedName);
      toast.success("Passkey added. You can now sign in with biometrics or your device PIN.");
      await fetchPasskeys();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "NotAllowedError") { toast.error("Passkey registration was cancelled."); }
      else { toast.error("Registration failed. Please try again."); }
    } finally { setIsRegistering(false); }
  }

  function handleRevoke(id: string, name: string) {
    setRevokeTarget({ id, name });
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevokeInProgress(true);
    try {
      await revokePasskey(revokeTarget.id);
      toast.success(`"${revokeTarget.name}" has been removed.`);
      setPasskeys((prev) => prev.filter((p) => p.id !== revokeTarget.id));
      setRevokeTarget(null);
    } catch {
      toast.error("Failed to remove passkey. Please try again.");
    } finally {
      setRevokeInProgress(false);
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return "Never";
    return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <div className="mx-auto max-w-[640px]">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-3xl leading-tight text-[#1a0808] font-display">Security</h1>
        <p className="mt-1 text-sm font-medium text-[#7a5252]">Manage your passkeys and sign-in security settings.</p>
      </div>

      {/* Passkeys card */}
      <div
        className="overflow-hidden rounded-xl bg-white border border-[#e5d4cc]"
        style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}
      >
        <div className="flex items-center gap-2.5 px-5 py-4 bg-gradient-to-br from-[#fdf0eb] to-white border-b border-[#edd9d0]">
          <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-[#1a0808]">Passkeys</h2>
            <p className="mt-0.5 text-xs text-[#9b6e6e]">Sign in faster with your fingerprint, face scan, or device PIN — no OTP required.</p>
          </div>
        </div>

        <div className="p-5">
          {/* Browser not supported */}
          {!passkeySupported && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Passkeys require Chrome, Edge, or Safari. Your current browser is not supported.
            </div>
          )}

          {/* Add passkey button */}
          {passkeySupported && (
            <button type="button" onClick={() => void handleAddPasskey()} disabled={isRegistering}
              className="mb-5 rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
              style={{ background: isRegistering ? "#d4a0a0" : "linear-gradient(135deg, #b5343e, #c94060)" }}>
              {isRegistering ? "Registering..." : "+ Add Passkey"}
            </button>
          )}

          {/* Passkey list */}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-[#e8d5cc]" />
              ))}
            </div>
          ) : passkeys.length === 0 ? (
            <div role="status" className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mb-3 text-[#c08080]">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[#9b6e6e]">No passkeys registered.</p>
              <p className="mt-1 text-xs text-[#c08080]">Click &ldquo;Add Passkey&rdquo; to get started.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between rounded-xl border border-[#e5d4cc] bg-[#fdf5f0] px-4 py-3.5"
                >
                  <div className="flex items-center gap-3">
                    {/* Key icon */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#1a0808]">{pk.device_name}</p>
                      <p className="text-xs text-[#9b6e6e]">
                        Added {formatDate(pk.created_at)}
                        {pk.last_used_at && ` · Last used ${formatDate(pk.last_used_at)}`}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => handleRevoke(pk.id, pk.device_name)}
                    className="shrink-0 rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-3 py-1.5 text-xs font-semibold text-[#dc2626] hover:bg-[#fee2e2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#dc2626]">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={revokeTarget !== null}
        title="Remove passkey?"
        description={
          revokeTarget
            ? `Remove "${revokeTarget.name}"? You will no longer be able to sign in with this passkey.`
            : "You will no longer be able to sign in with this passkey."
        }
        confirmLabel="Remove"
        isDangerous
        loading={revokeInProgress}
        onConfirm={() => void confirmRevoke()}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
