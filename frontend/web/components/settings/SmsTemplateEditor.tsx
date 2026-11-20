"use client";

/**
 * SmsTemplateEditor — edit one SMS reminder template (one message type, one
 * language): friendly placeholder chips, live problems, and the SMS exactly
 * as a patient receives it (sample patient).
 *
 * Controlled: the parent owns `value` and saves all changes together.
 * Language tabs live in SmsTemplateCard.
 */

import { useRef } from "react";
import { previewSms, smsParts, templateProblems } from "@/lib/sms-template";
import type { SmsTemplateSetting } from "@/lib/system-settings";

const PLACEHOLDER_LABELS: Record<string, string> = {
  patient_name: "Patient name",
  first_name: "First name",
  appointment_type: "Appointment type",
  scheduled_date: "Date",
  scheduled_time: "Time",
  vaccine_name: "Vaccine",
  dose_number: "Dose no.",
  due_date: "Due date",
  bhc_name: "Clinic name",
};

interface SmsTemplateEditorProps {
  template: SmsTemplateSetting;
  value: string;
  onChange: (next: string) => void;
  sampleValues: Record<string, string>;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SmsTemplateEditor({ template, value, onChange, sampleValues }: SmsTemplateEditorProps) {
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const boxId = `sms-${template.kind}-${template.language}`;

  const text = value.trim();
  const problems = templateProblems(text, {
    placeholders: template.placeholders,
    required: template.required,
    maxLength: template.max_length,
  });
  const preview = previewSms(text, sampleValues, template.send_limit);
  const filled = previewSms(text, sampleValues, null);
  const over = template.send_limit !== null ? filled.length - template.send_limit : 0;
  const isDefault = text === template.default;
  const rows = Math.min(8, Math.max(3, Math.ceil(value.length / 55) + 1));

  function insert(placeholder: string) {
    const box = boxRef.current;
    const token = `{${placeholder}}`;
    const start = box?.selectionStart ?? value.length;
    const end = box?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label htmlFor={boxId} className="text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">
          Message text
        </label>
        {template.is_custom ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            Custom{template.updated_by ? ` · ${template.updated_by}, ${formatWhen(template.updated_at)}` : ""}
          </span>
        ) : (
          <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-semibold text-stone-500">
            Built-in text
          </span>
        )}
        <button
          type="button"
          onClick={() => onChange(template.default)}
          disabled={isDefault}
          className="ml-auto rounded-md px-2 py-1 text-xs font-semibold text-[#b5343e] hover:bg-[#fdf0eb] disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-transparent"
        >
          Reset to default
        </button>
      </div>

      <textarea
        id={boxId}
        ref={boxRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={template.max_length + 20}
        spellCheck={false}
        className={`w-full resize-y rounded-lg border px-3 py-2 font-mono text-sm leading-relaxed text-[#1a0808] focus:outline-none focus:ring-2 focus:ring-[#b5343e]/40 ${
          problems.length > 0 ? "border-red-300 bg-red-50/40" : "border-[#e5d4cc]"
        }`}
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-[#9b6e6e]">Add:</span>
        {template.placeholders.map((p) => {
          const label = PLACEHOLDER_LABELS[p] ?? p;
          const required = template.required.includes(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => insert(p)}
              title={`Adds {${p}}`}
              aria-label={`Insert ${label}${required ? " (required)" : ""}`}
              className={`rounded-full border px-2.5 py-0.5 text-xs hover:bg-[#fdf0eb] ${
                required ? "border-[#e0a0a0] font-semibold text-[#b5343e]" : "border-[#e5d4cc] text-[#7a5252]"
              }`}
            >
              {label}{required ? " *" : ""}
            </button>
          );
        })}
      </div>
      {template.required.length > 0 && (
        <p className="mt-1 text-[11px] text-[#9b6e6e]">* must stay in the message. Words in {"{ }"} are filled in for each patient.</p>
      )}

      {problems.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[#9b6e6e]">
          What the patient receives <span className="font-normal normal-case tracking-normal">(sample patient)</span>
        </p>
        <div className="max-w-md rounded-2xl rounded-bl-sm border border-[#e5d4cc] bg-[#f7f3f1] px-4 py-2.5">
          <p data-testid="sms-preview" className="whitespace-pre-wrap break-words text-sm text-[#1a0808]">{preview}</p>
        </div>
        <p className="mt-1 text-[11px] text-[#9b6e6e]">
          {preview.length} characters · {smsParts(preview.length)} SMS
          {template.send_limit !== null && " · the confirmation code is added automatically"}
        </p>
        {over > 0 && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Too long by {over} characters: the end is replaced with &quot;...&quot; so the confirmation code fits.
            Shorten the message (longer patient names make it worse).
          </p>
        )}
      </div>
    </div>
  );
}
