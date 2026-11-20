"use client";

/**
 * SmsTemplateEditor — edit one SMS reminder template (one message type, one
 * language) with placeholder chips, live problems and a preview of the SMS
 * exactly as the scheduler sends it.
 *
 * Controlled: the parent owns `value` and saves all changes together.
 */

import { useId, useRef } from "react";
import { previewSms, smsParts, templateProblems } from "@/lib/sms-template";
import type { SmsTemplateSetting } from "@/lib/system-settings";

const LANGUAGE_LABELS: Record<string, string> = { en: "English", fil: "Filipino" };

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
  const id = useId();
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const language = LANGUAGE_LABELS[template.language] ?? template.language;

  const problems = templateProblems(value.trim(), {
    placeholders: template.placeholders,
    required: template.required,
    maxLength: template.max_length,
  });
  const preview = previewSms(value.trim(), sampleValues, template.send_limit);
  const filled = previewSms(value.trim(), sampleValues, null);
  const willBeCut = template.send_limit !== null && filled.length > template.send_limit;
  const isDefault = value.trim() === template.default;

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
    <div className="rounded-lg border border-[#edd9d0] bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-[#1a0808]">{language}</label>
        {template.is_custom ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            Custom{template.updated_by ? ` · ${template.updated_by}, ${formatWhen(template.updated_at)}` : ""}
          </span>
        ) : (
          <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-semibold text-stone-500">
            Default
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
        id={id}
        ref={boxRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={template.max_length + 20}
        spellCheck={false}
        className={`w-full rounded-lg border px-3 py-2 font-mono text-sm leading-relaxed text-[#1a0808] focus:outline-none focus:ring-2 focus:ring-[#b5343e]/40 ${
          problems.length > 0 ? "border-red-300 bg-red-50/40" : "border-[#e5d4cc]"
        }`}
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Insert a placeholder">
        <span className="text-xs text-[#9b6e6e]">Insert:</span>
        {template.placeholders.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => insert(p)}
            className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] hover:bg-[#fdf0eb] ${
              template.required.includes(p) ? "border-[#e0a0a0] text-[#b5343e]" : "border-[#e5d4cc] text-[#7a5252]"
            }`}
          >
            {`{${p}}`}
          </button>
        ))}
      </div>

      {problems.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-red-600">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      <div className="mt-3 rounded-lg bg-[#f7f3f1] px-3 py-2">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#9b6e6e]">Preview</p>
        <p data-testid="sms-preview" className="whitespace-pre-wrap break-words text-sm text-[#1a0808]">{preview}</p>
        <p className="mt-1 text-[11px] text-[#9b6e6e]">
          {preview.length} characters · {smsParts(preview.length)} SMS
          {template.send_limit !== null && " · the confirmation code is added automatically"}
        </p>
        {willBeCut && (
          <p className="mt-1 text-[11px] font-semibold text-amber-700">
            Longer than {template.send_limit} characters with real names: the end will be cut (&quot;...&quot;) so the code fits.
          </p>
        )}
      </div>
    </div>
  );
}
