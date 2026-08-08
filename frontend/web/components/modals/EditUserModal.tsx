"use client";

/**
 * EditUserModal — Admin-only modal for editing an existing staff account.
 *
 * Pre-fills fields from the passed `user` prop.
 * Fetches the list of non-admin roles from GET /users/roles on open.
 * Submits only changed fields to PUT /users/{id}.
 *
 * Props:
 *   open      — whether the modal is visible
 *   user      — the StaffUser being edited (null when modal is closed)
 *   onClose   — called when the modal is dismissed without saving
 *   onUpdated — called after successful update; parent refreshes the list
 */

import { useState, useEffect, useRef } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { swError } from "@/lib/swal";
import type { StaffUser } from "@/app/(dashboard)/settings/users/page";

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
  admin: "Admin",
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const PH_MOBILE_REGEX = /^\+639\d{9}$/;

function validateForm(fields: {
  full_name: string;
  email: string;
  mobile_number: string;
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
  return errs;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EditUserModalProps {
  open: boolean;
  user: StaffUser | null;
  onClose: () => void;
  onUpdated: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EditUserModal({
  open,
  user,
  onClose,
  onUpdated,
}: EditUserModalProps) {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Form fields — initialised from user prop
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [roleId, setRoleId] = useState("");
  const [isActive, setIsActive] = useState(true);

  // UI state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const firstInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill form when user changes or modal opens
  useEffect(() => {
    if (open && user) {
      setFullName(user.full_name);
      setEmail(user.email);
      setMobile(user.mobile_number);
      setIsActive(user.is_active);
      setFieldErrors({});
      setSubmitting(false);

      // Focus first field after paint
      setTimeout(() => firstInputRef.current?.focus(), 50);

      // Fetch roles (includes all non-admin roles)
      void fetchRoles(user.role);
    }
  }, [open, user]);

  async function fetchRoles(currentRoleName?: string) {
    setRolesLoading(true);
    try {
      const data = await apiFetch<RoleOption[]>("/users/roles");
      setRoles(data);
      // Pre-select the current user's role by name match
      if (currentRoleName) {
        const match = data.find((r) => r.name === currentRoleName);
        if (match) setRoleId(match.id);
        else if (data.length > 0) setRoleId(data[0].id);
      } else if (data.length > 0) {
        setRoleId(data[0].id);
      }
    } catch {
      // Roles failed to load — user sees empty select
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
    if (!user) return;

    const errs = validateForm({
      full_name: fullName,
      email,
      mobile_number: mobile,
    });
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    // Build partial update body — only include changed fields
    const body: Record<string, unknown> = {};
    if (fullName.trim() !== user.full_name) body.full_name = fullName.trim();
    if (email.trim().toLowerCase() !== user.email)
      body.email = email.trim().toLowerCase();
    if (mobile.trim() !== user.mobile_number) body.mobile_number = mobile.trim();
    if (isActive !== user.is_active) body.is_active = isActive;

    // Find selected role name to compare
    const selectedRole = roles.find((r) => r.id === roleId);
    if (selectedRole && selectedRole.name !== user.role) {
      body.role_id = roleId;
    }

    if (Object.keys(body).length === 0) {
      // Nothing changed — just close
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch(`/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      onUpdated();
    } catch (err) {
      void swError(err instanceof ApiError ? (err.message || "Failed to update user.") : "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-user-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2
            id="edit-user-title"
            className="text-base font-semibold text-slate-900"
          >
            Edit Staff Account
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
                htmlFor="eu-full-name"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Full name <span className="text-red-500">*</span>
              </label>
              <input
                id="eu-full-name"
                ref={firstInputRef}
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
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
                htmlFor="eu-email"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="eu-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                htmlFor="eu-mobile"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Mobile number <span className="text-red-500">*</span>
              </label>
              <input
                id="eu-mobile"
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
              {fieldErrors.mobile_number && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.mobile_number}
                </p>
              )}
            </div>

            {/* Role */}
            <div>
              <label
                htmlFor="eu-role"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Role
              </label>
              <select
                id="eu-role"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                disabled={rolesLoading}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50 disabled:text-slate-400"
              >
                {rolesLoading && <option value="">Loading roles...</option>}
                {!rolesLoading && roles.length === 0 && (
                  <option value="">No roles available</option>
                )}
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {ROLE_LABELS[r.name] ?? r.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Active status toggle */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Account active
                </p>
                <p className="text-xs text-slate-400">
                  Inactive accounts cannot log in.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setIsActive((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 ${
                  isActive ? "bg-teal-600" : "bg-slate-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    isActive ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
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
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
