"use client";

/**
 * CreateUserModal — Admin-only modal for creating a new staff account.
 *
 * Fetches the list of non-admin roles from GET /users/roles on open,
 * then POSTs to /users on form submission.
 *
 * credential_mode toggle:
 *   "password" — Admin sets a password directly (shown with confirm field).
 *   "passkey"  — Account is created with no password; the user registers a
 *                WebAuthn passkey on their first login.
 *
 * Props:
 *   open        — whether the modal is visible
 *   onClose     — called when the modal should be dismissed (no action taken)
 *   onCreated   — called after successful user creation; parent refreshes the list
 *   credentialMode — the mode chosen ("password" | "passkey") on success (for parent UX)
 */

import { useState, useEffect, useRef } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoleOption {
  id: string;
  name: string;
}

type CredentialMode = "password" | "passkey";

interface CreateUserPayload {
  full_name: string;
  email: string;
  mobile_number: string;
  role_id: string;
  send_welcome_sms: boolean;
  credential_mode: CredentialMode;
  password?: string;
}

const ROLE_LABELS: Record<string, string> = {
  bhw: "BHW",
  physician: "Physician",
  admin_staff: "Admin Staff",
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const PH_MOBILE_REGEX = /^\+639\d{9}$/;

interface FormFields {
  full_name: string;
  email: string;
  mobile_number: string;
  role_id: string;
  credential_mode: CredentialMode;
  password: string;
  confirm_password: string;
}

function validateForm(fields: FormFields): Record<string, string> {
  const errs: Record<string, string> = {};

  if (!fields.full_name.trim() || fields.full_name.trim().length < 2) {
    errs.full_name = "Full name must be at least 2 characters.";
  }
  if (fields.full_name.trim().length > 120) {
    errs.full_name = "Full name must be at most 120 characters.";
  }
  if (!fields.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    errs.email = "Please enter a valid email address.";
  }
  if (!PH_MOBILE_REGEX.test(fields.mobile_number)) {
    errs.mobile_number = "Mobile number must be in format +639XXXXXXXXX.";
  }
  if (!fields.role_id) {
    errs.role_id = "Please select a role.";
  }

  if (fields.credential_mode === "password") {
    if (!fields.password) {
      errs.password = "Password is required.";
    } else if (fields.password.length < 8) {
      errs.password = "Password must be at least 8 characters.";
    }
    if (fields.password && fields.confirm_password !== fields.password) {
      errs.confirm_password = "Passwords do not match.";
    }
  }

  return errs;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (credentialMode: CredentialMode) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CredentialToggleProps {
  value: CredentialMode;
  onChange: (mode: CredentialMode) => void;
}

function CredentialToggle({ value, onChange }: CredentialToggleProps) {
  const activeBase =
    "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500";
  const activePassword =
    value === "password"
      ? "bg-teal-600 text-white shadow-sm"
      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
  const activePasskey =
    value === "passkey"
      ? "bg-teal-600 text-white shadow-sm"
      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50";

  return (
    <div
      className="flex gap-2 rounded-xl bg-slate-100 p-1"
      role="group"
      aria-label="Authentication method"
    >
      <button
        type="button"
        onClick={() => onChange("password")}
        className={`${activeBase} ${activePassword}`}
        aria-pressed={value === "password"}
      >
        Set Password
      </button>
      <button
        type="button"
        onClick={() => onChange("passkey")}
        className={`${activeBase} ${activePasskey}`}
        aria-pressed={value === "passkey"}
      >
        Passkey (Passwordless)
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreateUserModal({
  open,
  onClose,
  onCreated,
}: CreateUserModalProps) {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("+639");
  const [roleId, setRoleId] = useState("");
  const [credentialMode, setCredentialMode] = useState<CredentialMode>("password");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens / closes
  useEffect(() => {
    if (open) {
      setFullName("");
      setEmail("");
      setMobile("+639");
      setRoleId("");
      setCredentialMode("password");
      setPassword("");
      setConfirmPassword("");
      setFieldErrors({});
      setSubmitting(false);
      setShowPassword(false);
      setShowConfirmPassword(false);

      // Focus first field after paint
      setTimeout(() => firstInputRef.current?.focus(), 50);

      // Fetch roles
      void fetchRoles();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function fetchRoles() {
    setRolesLoading(true);
    try {
      const data = await apiFetch<RoleOption[]>("/users/roles");
      setRoles(data);
      // Pre-select the first non-admin role
      if (data.length > 0 && !roleId) {
        setRoleId(data[0].id);
      }
    } catch {
      // Roles failed to load — user will see an empty select
    } finally {
      setRolesLoading(false);
    }
  }

  // When credential mode switches, clear password errors and values
  function handleCredentialModeChange(mode: CredentialMode) {
    setCredentialMode(mode);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.password;
      delete next.confirm_password;
      return next;
    });
  }

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open && !submitting) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errs = validateForm({
      full_name: fullName,
      email,
      mobile_number: mobile,
      role_id: roleId,
      credential_mode: credentialMode,
      password,
      confirm_password: confirmPassword,
    });
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload: CreateUserPayload = {
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      mobile_number: mobile.trim(),
      role_id: roleId,
      send_welcome_sms: true,
      credential_mode: credentialMode,
      ...(credentialMode === "password" ? { password } : {}),
    };

    setSubmitting(true);
    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onCreated(credentialMode);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message || "Failed to create user."
          : "Network error. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const inputBase =
    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";
  const inputError = "border-red-300 bg-red-50";
  const inputNormal = "border-slate-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2
            id="create-user-title"
            className="text-base font-semibold text-slate-900"
          >
            Add Staff Account
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="max-h-[70vh] overflow-y-auto">
            <div className="space-y-4 px-6 py-5">
              {/* Full name */}
              <div>
                <label
                  htmlFor="cu-full-name"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Full name <span className="text-red-500">*</span>
                </label>
                <input
                  id="cu-full-name"
                  ref={firstInputRef}
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Juan dela Cruz"
                  className={`${inputBase} ${fieldErrors.full_name ? inputError : inputNormal}`}
                  suppressHydrationWarning
                />
                {fieldErrors.full_name && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.full_name}
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="cu-email"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="cu-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="juan@bhc.local"
                  className={`${inputBase} ${fieldErrors.email ? inputError : inputNormal}`}
                  suppressHydrationWarning
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Mobile number */}
              <div>
                <label
                  htmlFor="cu-mobile"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Mobile number <span className="text-red-500">*</span>
                </label>
                <input
                  id="cu-mobile"
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="+639XXXXXXXXX"
                  className={`${inputBase} ${fieldErrors.mobile_number ? inputError : inputNormal}`}
                  suppressHydrationWarning
                />
                {fieldErrors.mobile_number ? (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.mobile_number}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    Philippine mobile number in E.164 format (+639XXXXXXXXX)
                  </p>
                )}
              </div>

              {/* Role */}
              <div>
                <label
                  htmlFor="cu-role"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Role <span className="text-red-500">*</span>
                </label>
                <select
                  id="cu-role"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  disabled={rolesLoading}
                  className={`${inputBase} disabled:bg-slate-50 disabled:text-slate-400 ${
                    fieldErrors.role_id ? inputError : inputNormal
                  }`}
                >
                  {rolesLoading && (
                    <option value="">Loading roles...</option>
                  )}
                  {!rolesLoading && roles.length === 0 && (
                    <option value="">No roles available</option>
                  )}
                  {!rolesLoading && roles.length > 0 && !roleId && (
                    <option value="">Select a role</option>
                  )}
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {ROLE_LABELS[r.name] ?? r.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.role_id && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.role_id}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  Admin accounts can only be created via the seed script.
                </p>
              </div>

              {/* Authentication method toggle */}
              <div>
                <p className="mb-2 block text-sm font-medium text-slate-700">
                  Authentication method <span className="text-red-500">*</span>
                </p>
                <CredentialToggle
                  value={credentialMode}
                  onChange={handleCredentialModeChange}
                />
              </div>

              {/* Password fields — shown only in password mode */}
              {credentialMode === "password" && (
                <div className="space-y-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-4">
                  {/* Password */}
                  <div>
                    <label
                      htmlFor="cu-password"
                      className="mb-1 block text-sm font-medium text-slate-700"
                    >
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="cu-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        autoComplete="new-password"
                        className={`${inputBase} pr-10 ${
                          fieldErrors.password ? inputError : inputNormal
                        }`}
                        suppressHydrationWarning
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {fieldErrors.password && (
                      <p className="mt-1 text-xs text-red-600">
                        {fieldErrors.password}
                      </p>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div>
                    <label
                      htmlFor="cu-confirm-password"
                      className="mb-1 block text-sm font-medium text-slate-700"
                    >
                      Confirm password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="cu-confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                        className={`${inputBase} pr-10 ${
                          fieldErrors.confirm_password ? inputError : inputNormal
                        }`}
                        suppressHydrationWarning
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500"
                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                      >
                        {showConfirmPassword ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {fieldErrors.confirm_password && (
                      <p className="mt-1 text-xs text-red-600">
                        {fieldErrors.confirm_password}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Passkey info — shown only in passkey mode */}
              {credentialMode === "passkey" && (
                <div className="flex items-start gap-3 rounded-lg border border-teal-100 bg-teal-50 px-4 py-3">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="mt-0.5 shrink-0 text-teal-600"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-sm text-teal-800">
                    No password will be set. The user will be prompted to
                    register a passkey (fingerprint, face ID, or security key)
                    on their first login. A welcome SMS will be sent to their
                    mobile number.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || rolesLoading}
              className="min-w-[100px] rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {submitting ? "Creating..." : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
