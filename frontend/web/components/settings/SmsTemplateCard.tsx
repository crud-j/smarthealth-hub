"use client";

/**
 * SmsTemplateCard — one SMS message type (e.g. "Appointment reminder") with
 * English / Filipino tabs; only the selected language's editor is shown.
 * A tab says "edited" when its text differs from the built-in default and
 * "needs fixing" when the text has a problem.
 */

import { useState } from "react";
import SmsTemplateEditor from "@/components/settings/SmsTemplateEditor";
import { templateProblems } from "@/lib/sms-template";
import { templateId, type SmsTemplateSetting } from "@/lib/system-settings";

const LANGUAGE_LABELS: Record<string, string> = { en: "English", fil: "Filipino" };

interface SmsTemplateCardProps {
  title: string;
  when: string;
  templates: SmsTemplateSetting[];
  values: Record<string, string>;
  onChange: (id: string, text: string) => void;
  sampleValues: Record<string, string>;
}

export default function SmsTemplateCard({ title, when, templates, values, onChange, sampleValues }: SmsTemplateCardProps) {
  const [active, setActive] = useState(templates[0]?.language ?? "en");
  const current = templates.find((t) => t.language === active) ?? templates[0];
  if (!current) return null;

  return (
    <div className="rounded-xl border border-[#edd9d0] bg-white">
      <div className="flex flex-wrap items-end gap-3 border-b border-[#f0e4dd] px-4 pt-4">
        <div className="mb-3 mr-auto">
          <h3 className="text-sm font-bold text-[#1a0808]">{title}</h3>
          <p className="text-xs text-[#9b6e6e]">{when}</p>
        </div>
        <div role="tablist" aria-label={`${title} language`} className="flex gap-1">
          {templates.map((t) => {
            const id = templateId(t);
            const text = (values[id] ?? t.value).trim();
            const broken = templateProblems(text, { placeholders: t.placeholders, required: t.required, maxLength: t.max_length }).length > 0;
            const edited = text !== t.default;
            const selected = t.language === current.language;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(t.language)}
                className={`-mb-px rounded-t-lg border px-3 py-1.5 text-sm font-medium ${
                  selected ? "border-[#edd9d0] border-b-white bg-white text-[#1a0808]" : "border-transparent text-[#9b6e6e] hover:text-[#3d2222]"
                }`}
              >
                {LANGUAGE_LABELS[t.language] ?? t.language}
                {broken ? (
                  <span className="ml-1.5 text-[11px] font-semibold text-red-600">· needs fixing</span>
                ) : edited ? (
                  <span className="ml-1.5 text-[11px] font-semibold text-amber-700">· edited</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="p-4" role="tabpanel">
        <SmsTemplateEditor
          key={templateId(current)}
          template={current}
          value={values[templateId(current)] ?? current.value}
          onChange={(text) => onChange(templateId(current), text)}
          sampleValues={sampleValues}
        />
      </div>
    </div>
  );
}
