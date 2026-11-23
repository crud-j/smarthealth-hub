"use client";

/**
 * Profile & Security (one page for every signed-in role).
 *
 *   Account    GET /users/me (name, email, mobile, role, status, member since,
 *              last sign-in) and a sign-in protection summary.
 *   Password   POST /auth/change-password. Same rules as the backend
 *              (8+ characters, an uppercase letter, a number), checked live.
 *              A wrong current password is a 422 shown under the field.
 *              Passkey-only accounts (has_password false) have no password.
 *   Passkeys   GET/POST/DELETE /auth/passkey/... (list, add with a name typed
 *              on the page, remove with a confirmation).
 *
 * /settings/security redirects here (#passkeys).
 */

import { useEffect, useId, useState } from "react";
import {
  BadgeCheck,
  CalendarClock,
  Check,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCurrentUser } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { IconBadge } from "@/components/dashboard/shared";
import {
  listPasskeys,
  passkeyRegisterBegin,
  passkeyRegisterComplete,
  revokePasskey,
  type PasskeyCredentialInfo,
} from "@/lib/auth";
import { isPasskeySupported, startPasskeyRegistration } from "@/lib/passkey";

const ROLE_LABELS: Record<string, string> = {
  admin: "System Administrator",
  bhw: "Barangay Health Worker",
  physician: "Physician",
  admin_staff: "Admin Staff",
};

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-violet-50 text-violet-700 ring-violet-200",
  bhw: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  physician: "bg-sky-50 text-sky-700 ring-sky-200",
  admin_staff: "bg-stone-100 text-stone-600 ring-stone-200",
};

/** Same rules as the backend ChangePasswordRequest. */
const PASSWORD_RULES: Array<{ label: string; ok: (pw: string) => boolean }> = [
  { label: "At least 8 characters", ok: (pw) => pw.length >= 8 },
  { label: "An uppercase letter", ok: (pw) => /[A-Z]/.test(pw) },
  { label: "A number", ok: (pw) => /[0-9]/.test(pw) },
];

const card =
  "overflow-hidden rounded-2xl border border-[#eadbd3] bg-white shadow-[0_1px_2px_rgba(60,20,20,0.04),0_8px_24px_-12px_rgba(120,40,40,0.12)]";
const inputCls =
  "w-full rounded-xl border border-[#e5d4cc] bg-white px-3.5 py-2.5 text-sm text-[#1a0808] transition placeholder:text-[#c4a9a0] hover:border-[#dcc4ba] focus-visible:border-[#b5343e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]/25";
const labelCls = "mb-1.5 block text-sm font-medium text-[#4a2c2c]";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#b5343e] to-[#c94060] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5343e]";

function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "Asia/Manila",
  });
}

function initials(name: string | undefined): string {
  const parts = (name ?? "").replace(/^(dr|mr|mrs|ms)\.?\s+/i, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function SectionHeader({ id, icon, title, subtitle }: { id: string; icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#f0e4dd] bg-gradient-to-br from-[#fdf0eb] to-white px-5 py-4">
      <IconBadge icon={icon} tone="rose" size="sm" />
      <div>
        <h2 id={id} className="text-sm font-bold text-[#1a0808]">{title}</h2>
        <p className="text-xs text-[#8a6a6a]">{subtitle}</p>
      </div>
    </div>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  invalid,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${inputCls} pr-11 ${invalid ? "border-[#f0a0a0] bg-[#fffafa]" : ""}`}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-[#9b7e7e] hover:text-[#5a3a3a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]"
        >
          {shown ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export default function ProfileSecurityPage() {
  const { user, isLoading } = useCurrentUser();
  const headingId = useId();
  const hasPassword = user?.has_password !== false;

  // ── Password ──────────────────────────────────────────────────────────────
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rulesOk = PASSWORD_RULES.every((r) => r.ok(next));
  const matches = next.length > 0 && next === confirm;
  const canSave = current.length > 0 && rulesOk && matches && !saving;

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setCurrentError(null);
    setFormError(null);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      toast.success("Password changed. Use the new one next time you sign in.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not change the password. Please try again.";
      if (/current password/i.test(message)) setCurrentError(message);
      else if (err instanceof ApiError && err.status === 429) setFormError("Too many tries. Wait 15 minutes, then try again.");
      else setFormError(message);
    } finally {
      setSaving(false);
    }
  }

  // ── Passkeys ──────────────────────────────────────────────────────────────
  const [passkeys, setPasskeys] = useState<PasskeyCredentialInfo[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(true);
  const [supported, setSupported] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<PasskeyCredentialInfo | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setSupported(isPasskeySupported());
  }, []);

  async function loadPasskeys() {
    try {
      const { credentials } = await listPasskeys();
      setPasskeys(credentials);
    } catch {
      toast.error("Could not load your passkeys.");
    } finally {
      setPasskeysLoading(false);
    }
  }

  useEffect(() => {
    void loadPasskeys();
  }, []);

  async function addPasskey(e: React.FormEvent) {
    e.preventDefault();
    const name = deviceName.trim() || "My passkey";
    setRegistering(true);
    try {
      const { options } = await passkeyRegisterBegin(name);
      const attestation = await startPasskeyRegistration(options);
      await passkeyRegisterComplete(attestation, name);
      toast.success(`"${name}" added. You can now sign in with it, without a code.`);
      setDeviceName("");
      await loadPasskeys();
    } catch (err) {
      toast.error(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Passkey setup was cancelled."
          : "Could not add the passkey. Please try again.",
      );
    } finally {
      setRegistering(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await revokePasskey(removeTarget.id);
      toast.success(`"${removeTarget.device_name}" removed.`);
      setPasskeys((prev) => prev.filter((p) => p.id !== removeTarget.id));
      setRemoveTarget(null);
    } catch {
      toast.error("Could not remove the passkey. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const protection: Array<{ icon: LucideIcon; label: string; value: string; on: boolean }> = [
    { icon: LockKeyhole, label: "Password", value: hasPassword ? "Set" : "Not set (passkey only)", on: hasPassword },
    {
      icon: Mail,
      label: "Sign-in code by email",
      value: user?.mfa_enabled === false ? "Off" : "On",
      on: user?.mfa_enabled !== false,
    },
    {
      icon: Fingerprint,
      label: "Passkeys",
      value: passkeysLoading ? "…" : passkeys.length === 0 ? "None yet" : `${passkeys.length} saved`,
      on: passkeys.length > 0,
    },
  ];

  return (
    <div className="mx-auto max-w-[920px]">
      <div className="mb-6">
        <h1 id={headingId} className="font-display text-3xl leading-tight tracking-tight text-[#1a0808]">
          Profile &amp; Security
        </h1>
        <p className="mt-1 text-sm font-medium text-[#7a5252]">Your account, your password and the passkeys you sign in with.</p>
      </div>

      {/* Identity */}
      <section id="account" aria-label="Account" className={`${card} mb-4 scroll-mt-24`}>
        <div className="relative flex flex-wrap items-center gap-5 bg-[radial-gradient(120%_140%_at_0%_0%,#fdf0eb_0%,#ffffff_60%)] px-6 py-6">
          {isLoading ? (
            <div className="flex w-full items-center gap-5">
              <div className="h-16 w-16 animate-pulse rounded-full bg-[#f0e4de]" />
              <div className="flex-1 space-y-2">
                <div className="h-6 w-56 animate-pulse rounded-md bg-[#f0e4de]" />
                <div className="h-4 w-40 animate-pulse rounded-md bg-[#f0e4de]" />
              </div>
            </div>
          ) : (
            <>
              <span
                aria-hidden="true"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#b5343e] to-[#d9606a] font-display text-2xl text-white ring-4 ring-white shadow-md"
              >
                {initials(user?.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-2xl leading-tight text-[#1a0808]">{user?.full_name ?? "—"}</p>
                <p className="truncate text-sm text-[#7a5252]">{user?.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${ROLE_BADGE[user?.role ?? ""] ?? ROLE_BADGE.admin_staff}`}>
                    <BadgeCheck size={13} aria-hidden="true" />
                    {ROLE_LABELS[user?.role ?? ""] ?? user?.role ?? "—"}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${user?.is_active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-stone-100 text-stone-500 ring-stone-200"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${user?.is_active ? "bg-emerald-500" : "bg-stone-400"}`} aria-hidden="true" />
                    {user?.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
              <nav aria-label="On this page" className="flex w-full flex-wrap gap-2 sm:w-auto">
                {[
                  { href: "#password", label: "Password" },
                  { href: "#passkeys", label: "Passkeys" },
                ].map((l) => (
                  <a key={l.href} href={l.href}
                    className="inline-flex min-h-10 items-center rounded-xl border border-[#e5d4cc] bg-white px-3.5 text-sm font-semibold text-[#5a3a3a] transition hover:border-[#d9a9a0] hover:text-[#b5343e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b5343e]">
                    {l.label}
                  </a>
                ))}
              </nav>
            </>
          )}
        </div>

        <div className="grid gap-px border-t border-[#f0e4dd] bg-[#f0e4dd] md:grid-cols-2">
          <dl className="space-y-3.5 bg-white px-6 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#b5343e]">Account details</p>
            {[
              { icon: UserRound, label: "Full name", value: user?.full_name },
              { icon: Mail, label: "Email", value: user?.email },
              { icon: Phone, label: "Mobile", value: user?.mobile_number },
              { icon: CalendarClock, label: "Member since", value: formatDate(user?.created_at) },
              { icon: CalendarClock, label: "Last sign-in", value: formatDate(user?.last_login_at, true) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon size={16} className="mt-0.5 shrink-0 text-[#c08080]" aria-hidden="true" />
                <dt className="w-28 shrink-0 text-sm text-[#9b6e6e]">{label}</dt>
                <dd className="min-w-0 break-words text-sm font-medium text-[#1a0808]">{isLoading ? "…" : value || "—"}</dd>
              </div>
            ))}
            <p className="pt-1 text-xs text-[#a88a84]">To change your name, email or mobile, ask a System Administrator (Users page).</p>
          </dl>
          <div className="bg-white px-6 py-5">
            <p className="mb-3.5 text-xs font-bold uppercase tracking-[0.14em] text-[#b5343e]">Sign-in protection</p>
            <ul className="space-y-2.5">
              {protection.map(({ icon: Icon, label, value, on }) => (
                <li key={label} className="flex items-center gap-3 rounded-xl border border-[#f0e4dd] bg-[#fffaf7] px-3.5 py-2.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${on ? "bg-emerald-50 text-emerald-600" : "bg-stone-100 text-stone-400"}`}>
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-[#3d2222]">{label}</span>
                  <span className={`text-sm font-semibold ${on ? "text-emerald-700" : "text-[#9b7e7e]"}`}>{value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Password */}
        <section id="password" aria-labelledby="password-title" className={`${card} scroll-mt-24`}>
          <SectionHeader id="password-title" icon={KeyRound} title="Password" subtitle="Change the password you sign in with." />
          {!isLoading && !hasPassword ? (
            <p className="m-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              This account signs in with a passkey and has no password. Ask a System Administrator if you need one.
            </p>
          ) : (
            <form onSubmit={(e) => void changePassword(e)} noValidate className="space-y-4 p-5">
              <div>
                <PasswordInput id="current-password" label="Current password" value={current}
                  onChange={(v) => { setCurrent(v); setCurrentError(null); }} autoComplete="current-password"
                  invalid={!!currentError} describedBy={currentError ? "current-password-error" : undefined} />
                {currentError && (
                  <p id="current-password-error" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[#c0262d]">
                    <TriangleAlert size={13} aria-hidden="true" /> {currentError}
                  </p>
                )}
              </div>
              <PasswordInput id="new-password" label="New password" value={next} onChange={setNext}
                autoComplete="new-password" describedBy="new-password-rules" />
              <ul id="new-password-rules" aria-label="Password rules" className="grid gap-1.5 sm:grid-cols-3">
                {PASSWORD_RULES.map((rule) => {
                  const ok = rule.ok(next);
                  return (
                    <li key={rule.label} className={`flex items-center gap-1.5 text-xs font-medium ${ok ? "text-emerald-700" : "text-[#9b7e7e]"}`}>
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full ${ok ? "bg-emerald-500 text-white" : "border border-[#d9c2b8]"}`} aria-hidden="true">
                        {ok && <Check size={11} strokeWidth={3} />}
                      </span>
                      {rule.label}
                      <span className="sr-only">{ok ? " (done)" : " (not yet)"}</span>
                    </li>
                  );
                })}
              </ul>
              <div>
                <PasswordInput id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm}
                  autoComplete="new-password" invalid={confirm.length > 0 && !matches} />
                {confirm.length > 0 && !matches && (
                  <p className="mt-1.5 text-xs font-medium text-[#c0262d]">The two new passwords do not match.</p>
                )}
              </div>
              {formError && (
                <p role="alert" className="rounded-xl border border-[#f5c2c2] bg-[#fef4f4] px-3 py-2 text-sm text-[#9f1f26]">{formError}</p>
              )}
              <button type="submit" disabled={!canSave} className={`${primaryBtn} w-full`}>
                {saving ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
                {saving ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </section>

        {/* Passkeys */}
        <section id="passkeys" aria-labelledby="passkeys-title" className={`${card} scroll-mt-24`}>
          <SectionHeader id="passkeys-title" icon={Fingerprint} title="Passkeys"
            subtitle="Sign in with your fingerprint, face or device PIN, without a code." />
          <div className="p-5">
            {!supported ? (
              <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                This browser cannot make passkeys. Use Chrome, Edge or Safari on this device.
              </p>
            ) : (
              <form onSubmit={(e) => void addPasskey(e)} className="mb-5">
                <label htmlFor="passkey-name" className={labelCls}>Name the new passkey</label>
                <div className="flex gap-2">
                  <input id="passkey-name" type="text" maxLength={60} value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)} placeholder="e.g. Clinic PC, my phone"
                    className={inputCls} />
                  <button type="submit" disabled={registering} className={`${primaryBtn} shrink-0`}>
                    {registering ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                    {registering ? "Waiting…" : "Add passkey"}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-[#a88a84]">Your device will ask for your fingerprint, face or PIN.</p>
              </form>
            )}

            {passkeysLoading ? (
              <div className="space-y-2.5">
                {[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-[#f4e8e3]" />)}
              </div>
            ) : passkeys.length === 0 ? (
              <div role="status" className="flex flex-col items-center rounded-2xl border border-dashed border-[#e5d4cc] px-4 py-7 text-center">
                <Fingerprint size={30} className="mb-2 text-[#d0a8a0]" aria-hidden="true" />
                <p className="text-sm font-semibold text-[#7a5252]">No passkeys yet</p>
                <p className="mt-0.5 text-xs text-[#a88a84]">Add one to sign in faster on this device.</p>
              </div>
            ) : (
              <ul className="space-y-2.5" aria-label="Your passkeys">
                {passkeys.map((pk) => (
                  <li key={pk.id} className="flex items-center gap-3 rounded-xl border border-[#f0e4dd] bg-[#fffaf7] px-3.5 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#b5343e] ring-1 ring-[#f0d6d0]">
                      <KeyRound size={17} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#1a0808]">{pk.device_name}</p>
                      <p className="text-xs text-[#9b6e6e]">
                        Added {formatDate(pk.created_at)} · {pk.last_used_at ? `Last used ${formatDate(pk.last_used_at)}` : "Not used yet"}
                      </p>
                    </div>
                    <button type="button" onClick={() => setRemoveTarget(pk)} aria-label={`Remove ${pk.device_name}`}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#f5c2c2] bg-white px-3 text-xs font-semibold text-[#c0262d] transition hover:bg-[#fef2f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c0262d]">
                      <Trash2 size={14} aria-hidden="true" /> Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <AlertDialog
        open={removeTarget !== null}
        title="Remove passkey?"
        description={
          removeTarget
            ? `Remove "${removeTarget.device_name}"? You will no longer be able to sign in with it.`
            : "You will no longer be able to sign in with this passkey."
        }
        confirmLabel="Remove"
        isDangerous
        loading={removing}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
