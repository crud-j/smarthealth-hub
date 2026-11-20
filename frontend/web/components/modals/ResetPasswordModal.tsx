"use client";

/**
 * ResetPasswordModal — Admin sets a temporary password for a staff account.
 *
 * Calls POST /users/{id}/reset-password, which also signs the account out
 * everywhere (sessions and remembered devices). The admin hands the password
 * over in person; ticking the box also texts it to the user's registered
 * mobile. The password is never stored in the browser beyond this form.
 *
 * Props:
 *   open    — whether the modal is visible
 *   user    — the account being reset (null when closed)
 *   onClose — dismissed without resetting
 *   onDone  — reset succeeded: (result, smsSent)
 */

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { generateTempPassword, passwordProblems } from "@/lib/staff-password";

export interface AccountActionResult {
  message: string;
  trusted_devices_removed: number;
}

interface ResetPasswordModalProps {
  open: boolean;
  user: { id: string; full_name: string; mobile_number: string } | null;
  onClose: () => void;
  onDone: (result: AccountActionResult, smsSent: boolean) => void;
}

export default function ResetPasswordModal({ open, user, onClose, onDone }: ResetPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [sendSms, setSendSms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // The parent mounts this per open (key = user id), so state starts empty.
  if (!open || !user) return null;

  const problems = passwordProblems(password);
  const canSubmit = problems.length === 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await apiFetch<AccountActionResult>(`/users/${user.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ new_password: password, send_sms: sendSms }),
      });
      onDone(result, sendSms);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset the password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-pw-title"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="reset-pw-title" className="text-base font-semibold text-slate-900">
            Reset password for {user.full_name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-slate-600">
              They will be signed out on every device and must log in with this
              temporary password (and the OTP), then change it on their Security page.
            </p>

            <div>
              <label htmlFor="reset-pw" className="mb-1 block text-sm font-medium text-slate-700">
                Temporary password
              </label>
              <div className="flex gap-2">
                <input
                  id="reset-pw"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={128}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  suppressHydrationWarning
                />
                <button
                  type="button"
                  onClick={() => setPassword(generateTempPassword())}
                  disabled={submitting}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Generate
                </button>
              </div>
              {password !== "" && problems.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-red-600" aria-label="Password still needs">
                  {problems.map((p) => (
                    <li key={p}>Needs: {p}</li>
                  ))}
                </ul>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={sendSms}
                onChange={(e) => setSendSms(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Also text it to {user.mobile_number}
            </label>

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>

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
              disabled={!canSubmit}
              className="min-w-[100px] rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {submitting ? "Resetting..." : "Reset password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
