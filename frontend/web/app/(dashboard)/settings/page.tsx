"use client";

/**
 * System Configuration — Admin only.
 *
 * Editable (GET/PUT /system/settings, audited): clinic name, reminder lead
 * times and the SMS reminder templates. Changes apply from the next reminder
 * run; no restart needed. Read-only server settings (environment, SMS
 * provider, NFC base URL) still come from GET /system/info (.env).
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import AccessDenied from "@/components/layout/AccessDenied";
import RoleGuard from "@/components/layout/RoleGuard";
import SmsTemplateCard from "@/components/settings/SmsTemplateCard";
import {
  buildSettingsUpdate,
  draftFrom,
  draftProblems,
  type SettingsDraft,
  type SettingsUpdate,
  type SettingValue,
  type SystemSettings,
} from "@/lib/system-settings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SystemInfo {
  environment: string;
  sms_provider: string;
  nfc_view_base_url: string;
}

const TEMPLATE_GROUPS: { kind: string; title: string; when: (s: SettingsDraft) => string }[] = [
  {
    kind: "appointment_reminder",
    title: "Appointment reminder",
    when: (d) => `Sent ${d.leadHours || "?"} hours before the appointment. Patients reply CONFIRM with the code.`,
  },
  {
    kind: "immunization_reminder",
    title: "Immunization reminder",
    when: (d) => `Sent at 10:00 AM, ${d.leadDays || "?"} days before the vaccine is due.`,
  },
  {
    kind: "missed_appointment",
    title: "Missed appointment follow-up",
    when: () => "Sent the same day an appointment is marked missed.",
  },
];

function changeCount(update: SettingsUpdate): number {
  const { sms_templates, ...rest } = update;
  return Object.keys(rest).length + Object.keys(sms_templates ?? {}).length;
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-[#edd9d0] bg-gradient-to-br from-[#fdf0eb] to-white px-5 py-4">
      <span className="inline-block h-4 w-1 rounded-full bg-gradient-to-b from-[#b5343e] to-[#e07070]" aria-hidden="true" />
      <h2 className="text-sm font-bold text-[#1a0808]">{title}</h2>
      {note && <span className="ml-auto text-xs text-[#c08080]">{note}</span>}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-[#e5d4cc] bg-white" style={{ boxShadow: "0 2px 10px rgba(160,80,80,0.07)" }}>
      {children}
    </section>
  );
}

function FieldMeta<T>({ setting }: { setting: SettingValue<T> }) {
  return (
    <p className="mt-1 text-[11px] text-[#9b6e6e]">
      {setting.is_custom
        ? `Changed${setting.updated_by ? ` by ${setting.updated_by}` : ""} · default: ${String(setting.default)}`
        : "Default value"}
    </p>
  );
}

const inputCls = "w-full rounded-lg border px-3 py-2 text-sm text-[#1a0808] focus:outline-none focus:ring-2 focus:ring-[#b5343e]/40";

function ReadOnlyItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#f0e4dd] px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-[#1a0808]">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function SystemConfiguration() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiFetch<SystemSettings>("/system/settings"), apiFetch<SystemInfo>("/system/info")])
      .then(([s, i]) => {
        if (cancelled) return;
        setSettings(s);
        setDraft(draftFrom(s));
        setInfo(i);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Failed to load system configuration.");
      });
    return () => { cancelled = true; };
  }, []);

  const update = useMemo(() => (settings && draft ? buildSettingsUpdate(settings, draft) : {}), [settings, draft]);
  const problems = useMemo(() => (settings && draft ? draftProblems(settings, draft) : {}), [settings, draft]);
  const pending = changeCount(update);
  const problemCount = Object.keys(problems).length;

  // Warn before leaving the page with unsaved edits.
  useEffect(() => {
    if (pending === 0) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  async function save() {
    if (pending === 0 || problemCount > 0) return;
    setSaving(true);
    try {
      const saved = await apiFetch<SystemSettings>("/system/settings", { method: "PUT", body: JSON.stringify(update) });
      setSettings(saved);
      setDraft(draftFrom(saved));
      toast.success("Settings saved. Reminders use them from the next run.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  const setField = (patch: Partial<SettingsDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="pb-24">
      <div className="mb-6">
        <h1 className="font-display text-3xl leading-tight text-[#1a0808]">System Configuration</h1>
        <p className="mt-1 text-sm font-medium text-[#7a5252]">
          Clinic name, clinic hours, reminder timing and SMS text. Every change is recorded in the Audit Log.
        </p>
      </div>

      {loadError && (
        <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">
          Could not load system configuration: {loadError}
        </div>
      )}

      {!settings || !draft ? (
        !loadError && <div className="h-64 animate-pulse rounded-xl bg-[#f5e8e4]" aria-label="Loading" />
      ) : (
        <>
          <Card>
            <SectionHeader title="Clinic, hours & reminders" />
            <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-3">
              <div>
                <label htmlFor="bhc-name" className="mb-1 block text-sm font-medium text-[#3d2222]">Clinic name</label>
                <input id="bhc-name" value={draft.bhcName} maxLength={120}
                  onChange={(e) => setField({ bhcName: e.target.value })}
                  className={`${inputCls} ${problems.bhcName ? "border-red-300" : "border-[#e5d4cc]"}`} />
                {problems.bhcName ? <p className="mt-1 text-xs text-red-600">{problems.bhcName[0]}</p> : <FieldMeta setting={settings.bhc_name} />}
                <p className="mt-1 text-[11px] text-[#9b6e6e]">Used in SMS and on the registration QR poster.</p>
              </div>
              <div>
                <label htmlFor="lead-hours" className="mb-1 block text-sm font-medium text-[#3d2222]">Appointment reminder (hours before)</label>
                <input id="lead-hours" type="number" inputMode="numeric" min={1} max={168} value={draft.leadHours}
                  onChange={(e) => setField({ leadHours: e.target.value })}
                  className={`${inputCls} ${problems.leadHours ? "border-red-300" : "border-[#e5d4cc]"}`} />
                {problems.leadHours ? <p className="mt-1 text-xs text-red-600">{problems.leadHours[0]}</p> : <FieldMeta setting={settings.sms_reminder_lead_hours} />}
              </div>
              <div>
                <label htmlFor="lead-days" className="mb-1 block text-sm font-medium text-[#3d2222]">Immunization reminder (days before)</label>
                <input id="lead-days" type="number" inputMode="numeric" min={0} max={30} value={draft.leadDays}
                  onChange={(e) => setField({ leadDays: e.target.value })}
                  className={`${inputCls} ${problems.leadDays ? "border-red-300" : "border-[#e5d4cc]"}`} />
                {problems.leadDays ? <p className="mt-1 text-xs text-red-600">{problems.leadDays[0]}</p> : <FieldMeta setting={settings.sms_immunization_lead_days} />}
              </div>
              <div>
                <label htmlFor="clinic-open" className="mb-1 block text-sm font-medium text-[#3d2222]">Clinic opens</label>
                <input id="clinic-open" type="time" value={draft.openTime}
                  onChange={(e) => setField({ openTime: e.target.value })}
                  className={`${inputCls} ${problems.openTime ? "border-red-300" : "border-[#e5d4cc]"}`} />
                {problems.openTime ? <p className="mt-1 text-xs text-red-600">{problems.openTime[0]}</p> : <FieldMeta setting={settings.clinic_open_time} />}
              </div>
              <div>
                <label htmlFor="clinic-close" className="mb-1 block text-sm font-medium text-[#3d2222]">Clinic closes</label>
                <input id="clinic-close" type="time" value={draft.closeTime}
                  onChange={(e) => setField({ closeTime: e.target.value })}
                  className={`${inputCls} ${problems.closeTime ? "border-red-300" : "border-[#e5d4cc]"}`} />
                {problems.closeTime ? <p className="mt-1 text-xs text-red-600">{problems.closeTime[0]}</p> : <FieldMeta setting={settings.clinic_close_time} />}
                <p className="mt-1 text-[11px] text-[#9b6e6e]">Appointments can only be booked from opening time until closing time (Manila time).</p>
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader title="SMS templates" note="Patients get the version in their preferred language" />
            <div className="space-y-5 p-5">
              {TEMPLATE_GROUPS.map((group) => (
                <SmsTemplateCard
                  key={group.kind}
                  title={group.title}
                  when={group.when(draft)}
                  templates={settings.sms_templates.filter((t) => t.kind === group.kind)}
                  values={draft.templates}
                  onChange={(id, next) => setDraft((d) => (d ? { ...d, templates: { ...d.templates, [id]: next } } : d))}
                  sampleValues={{ ...settings.sample_values, bhc_name: draft.bhcName.trim() || settings.sample_values.bhc_name }}
                />
              ))}
            </div>
          </Card>
        </>
      )}

      {info && (
        <Card>
          <SectionHeader title="Server settings" note="Read-only · change in the server's .env" />
          <dl className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
            <ReadOnlyItem label="Environment">{info.environment}</ReadOnlyItem>
            <ReadOnlyItem label="SMS provider">{info.sms_provider}</ReadOnlyItem>
            <ReadOnlyItem label="NFC base URL"><span className="break-all font-mono text-xs">{info.nfc_view_base_url}</span></ReadOnlyItem>
          </dl>
        </Card>
      )}

      {settings && draft && (pending > 0 || saving) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e5d4cc] bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(160,80,80,0.12)] backdrop-blur lg:left-auto lg:right-6 lg:bottom-6 lg:rounded-xl lg:border">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium text-[#3d2222]">
              {pending} unsaved change{pending === 1 ? "" : "s"}
              {problemCount > 0 && <span className="ml-2 text-red-600">· fix {problemCount} problem{problemCount === 1 ? "" : "s"} first</span>}
            </p>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setDraft(draftFrom(settings))} disabled={saving}
                className="rounded-lg border border-[#e5d4cc] px-4 py-2 text-sm font-medium text-[#3d2222] hover:bg-[#fdf5f0] disabled:opacity-50">
                Discard
              </button>
              <button type="button" onClick={() => void save()} disabled={saving || problemCount > 0}
                className="min-w-24 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #b5343e, #c94060)" }}>
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Admin only (backend: require_role("admin")). Non-admins who type the URL get
// a clear message instead of a failed API call.
export default function SettingsPage() {
  return (
    <RoleGuard roles={["admin"]} fallback={<AccessDenied allowed="Admins" what="the system configuration" />}>
      <SystemConfiguration />
    </RoleGuard>
  );
}
