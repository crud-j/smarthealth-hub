"use client";

/**
 * CreateUserModal — Admin-only modal for creating a new staff account.
 *
 * Fetches the list of non-admin roles from GET /users/roles on open,
 * then POSTs to /users on form submission.
 *
 * Props:
 *   open      — whether the modal is visible
 *   onClose   — called when the modal should be dismissed (no action taken)
 *   onCreated — called after successful user creation; parent refreshes the list
 */

import { useState, useEffect, useRef } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { swError } from "@/lib/swal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoleOption {
  id: string;
  name: string;
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

function validateForm(fields: {
  full_name: string;
  email: string;
  mobile_number: string;
  role_id: string;
}): Record<string, string> {
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
  return errs;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
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

  // UI state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens / closes
  useEffect(() => {
    if (open) {
      setFullName("");
      setEmail("");
      setMobile("+639");
      setRoleId("");
      setFieldErrors({});
      setSubmitting(false);

      // Focus first field after paint
      setTimeout(() => firstInputRef.current?.focus(), 50);

      // Fetch roles
      void fetchRoles();
    }
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
    });
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          mobile_number: mobile.trim(),
          role_id: roleId,
          send_welcome_sms: true,
        }),
      });
      onCreated();
    } catch (err) {
      void swError(err instanceof ApiError ? (err.message || "Failed to create user.") : "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

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
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  fieldErrors.full_name
                    ? "border-red-300 bg-red-50"
                    : "border-slate-200"
                }`}
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
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  fieldErrors.email
                    ? "border-red-300 bg-red-50"
                    : "border-slate-200"
                }`}
                suppressHydrationWarning
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
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
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  fieldErrors.mobile_number
                    ? "border-red-300 bg-red-50"
                    : "border-slate-200"
                }`}
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
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50 disabled:text-slate-400 ${
                  fieldErrors.role_id
                    ? "border-red-300 bg-red-50"
                    : "border-slate-200"
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
                <p className="mt-1 text-xs text-red-600">{fieldErrors.role_id}</p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                Admin accounts can only be created via the seed script.
              </p>
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
