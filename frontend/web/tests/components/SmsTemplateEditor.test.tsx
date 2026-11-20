import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import SmsTemplateCard from "@/components/settings/SmsTemplateCard";
import SmsTemplateEditor from "@/components/settings/SmsTemplateEditor";
import type { SmsTemplateSetting } from "@/lib/system-settings";

// System Configuration → SMS templates: one card per message type with
// English / Filipino tabs, and one editor per tab.

const SAMPLES = { first_name: "Juan", bhc_name: "BHC Uno", patient_name: "Juan Dela Cruz",
  appointment_type: "checkup", scheduled_date: "12/01/2026", scheduled_time: "09:00 AM" };

const MISSED_FIL: SmsTemplateSetting = {
  kind: "missed_appointment", language: "fil",
  value: "Hi {first_name}, call {bhc_name}.", default: "Kamusta {first_name}. {bhc_name}",
  is_custom: true, updated_at: "2026-11-20T08:00:00Z", updated_by: "Ana Admin",
  placeholders: ["first_name", "bhc_name"], required: [], max_length: 480, send_limit: null,
};
const MISSED_EN: SmsTemplateSetting = { ...MISSED_FIL, language: "en", value: "Hello {first_name}", default: "Hello {first_name}", is_custom: false, updated_at: null, updated_by: null };

const APPT: SmsTemplateSetting = {
  kind: "appointment_reminder", language: "en",
  value: "See you {scheduled_date} {scheduled_time}", default: "See you {scheduled_date} {scheduled_time}",
  is_custom: false, updated_at: null, updated_by: null,
  placeholders: ["patient_name", "appointment_type", "scheduled_date", "scheduled_time", "bhc_name"],
  required: ["scheduled_date", "scheduled_time"], max_length: 480, send_limit: 135,
};

function EditorHarness({ template }: { template: SmsTemplateSetting }) {
  const [value, setValue] = useState(template.value);
  return <SmsTemplateEditor template={template} value={value} onChange={setValue} sampleValues={SAMPLES} />;
}

const box = () => screen.getByRole("textbox") as HTMLTextAreaElement;

describe("SmsTemplateEditor", () => {
  it("shows who changed it and what the patient receives", () => {
    render(<EditorHarness template={MISSED_FIL} />);
    expect(screen.getByText(/Custom/)).toBeInTheDocument();
    expect(screen.getByText(/Ana Admin/)).toBeInTheDocument();
    expect(screen.getByText(/What the patient receives/)).toBeInTheDocument();
    expect(screen.getByTestId("sms-preview")).toHaveTextContent("Hi Juan, call BHC Uno.");
  });

  it("shows problems while typing", () => {
    render(<EditorHarness template={MISSED_FIL} />);
    fireEvent.change(box(), { target: { value: "Hi {nope}" } });
    expect(screen.getByText(/Unknown placeholder \{nope\}/)).toBeInTheDocument();
  });

  it("friendly chips insert the placeholder at the cursor", () => {
    render(<EditorHarness template={MISSED_FIL} />);
    fireEvent.change(box(), { target: { value: "Hi , bye" } });
    box().setSelectionRange(3, 3);
    fireEvent.click(screen.getByRole("button", { name: "Insert First name" }));
    expect(box().value).toBe("Hi {first_name}, bye");
  });

  it("marks required placeholders and explains the mark", () => {
    render(<EditorHarness template={APPT} />);
    expect(screen.getByRole("button", { name: "Insert Date (required)" })).toHaveTextContent("Date *");
    expect(screen.getByText(/must stay in the message/)).toBeInTheDocument();
  });

  it("Reset to default restores the built-in text, then disables itself", () => {
    render(<EditorHarness template={MISSED_FIL} />);
    const reset = screen.getByRole("button", { name: /Reset to default/ });
    fireEvent.click(reset);
    expect(box().value).toBe(MISSED_FIL.default);
    expect(reset).toBeDisabled();
  });

  it("appointment reminders show the CONFIRM code and say how much is too long", () => {
    render(<EditorHarness template={APPT} />);
    expect(screen.getByTestId("sms-preview")).toHaveTextContent(
      "See you 12/01/2026 09:00 AM CONFIRM 1234 to confirm.",
    );
    expect(screen.queryByText(/Too long/)).not.toBeInTheDocument();

    // "12/01/2026 09:00 AM " is 20 characters + 140 = 160 → 25 over the 135 limit.
    fireEvent.change(box(), { target: { value: `{scheduled_date} {scheduled_time} ${"x".repeat(140)}` } });
    expect(screen.getByText(/Too long by 25 characters/)).toBeInTheDocument();
  });
});

describe("SmsTemplateCard", () => {
  function CardHarness() {
    const [values, setValues] = useState<Record<string, string>>({
      "missed_appointment.en": MISSED_EN.value,
      "missed_appointment.fil": MISSED_FIL.value,
    });
    return (
      <SmsTemplateCard
        title="Missed appointment follow-up"
        when="Sent the same day."
        templates={[MISSED_EN, MISSED_FIL]}
        values={values}
        onChange={(id, text) => setValues((v) => ({ ...v, [id]: text }))}
        sampleValues={SAMPLES}
      />
    );
  }

  it("shows one language at a time and switches with tabs", () => {
    render(<CardHarness />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(box().value).toBe("Hello {first_name}");

    fireEvent.click(screen.getByRole("tab", { name: /Filipino/ }));
    expect(screen.getByRole("tab", { name: /Filipino/ })).toHaveAttribute("aria-selected", "true");
    expect(box().value).toBe("Hi {first_name}, call {bhc_name}.");
  });

  it("marks a tab that differs from the default or has a problem", () => {
    render(<CardHarness />);
    expect(screen.getByRole("tab", { name: /Filipino/ })).toHaveTextContent("edited");
    expect(screen.getByRole("tab", { name: /English/ })).not.toHaveTextContent("edited");

    fireEvent.change(box(), { target: { value: "Hi {nope}" } });
    expect(screen.getByRole("tab", { name: /English/ })).toHaveTextContent("needs fixing");
  });
});
