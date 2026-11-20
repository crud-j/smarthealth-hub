import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import SmsTemplateEditor from "@/components/settings/SmsTemplateEditor";
import type { SmsTemplateSetting } from "@/lib/system-settings";

// System Configuration → SMS templates: one editor per message type and language.

const SAMPLES = { first_name: "Juan", bhc_name: "BHC Uno", patient_name: "Juan Dela Cruz",
  appointment_type: "consultation", scheduled_date: "12/01/2026", scheduled_time: "09:00 AM" };

const MISSED: SmsTemplateSetting = {
  kind: "missed_appointment", language: "fil",
  value: "Hi {first_name}, call {bhc_name}.", default: "Kamusta {first_name}. {bhc_name}",
  is_custom: true, updated_at: "2026-11-20T08:00:00Z", updated_by: "Ana Admin",
  placeholders: ["first_name", "bhc_name"], required: [], max_length: 480, send_limit: null,
};

const APPT: SmsTemplateSetting = {
  kind: "appointment_reminder", language: "en",
  value: "See you {scheduled_date} {scheduled_time}", default: "See you {scheduled_date} {scheduled_time}",
  is_custom: false, updated_at: null, updated_by: null,
  placeholders: ["patient_name", "appointment_type", "scheduled_date", "scheduled_time", "bhc_name"],
  required: ["scheduled_date", "scheduled_time"], max_length: 480, send_limit: 135,
};

function Harness({ template }: { template: SmsTemplateSetting }) {
  const [value, setValue] = useState(template.value);
  return <SmsTemplateEditor template={template} value={value} onChange={setValue} sampleValues={SAMPLES} />;
}

const box = () => screen.getByRole("textbox") as HTMLTextAreaElement;

describe("SmsTemplateEditor", () => {
  it("shows the language, who changed it, and a live preview", () => {
    render(<Harness template={MISSED} />);
    expect(screen.getByText("Filipino")).toBeInTheDocument();
    expect(screen.getByText(/Custom/)).toBeInTheDocument();
    expect(screen.getByText(/Ana Admin/)).toBeInTheDocument();
    expect(screen.getByTestId("sms-preview")).toHaveTextContent("Hi Juan, call BHC Uno.");
  });

  it("updates the preview and shows problems while typing", () => {
    render(<Harness template={MISSED} />);
    fireEvent.change(box(), { target: { value: "Hi {nope}" } });
    expect(screen.getByText(/Unknown placeholder \{nope\}/)).toBeInTheDocument();
  });

  it("inserts a placeholder at the cursor", () => {
    render(<Harness template={MISSED} />);
    fireEvent.change(box(), { target: { value: "Hi , bye" } });
    box().setSelectionRange(3, 3);
    fireEvent.click(screen.getByRole("button", { name: "{first_name}" }));
    expect(box().value).toBe("Hi {first_name}, bye");
  });

  it("Reset to default restores the built-in text, then disables itself", () => {
    render(<Harness template={MISSED} />);
    const reset = screen.getByRole("button", { name: /Reset to default/ });
    fireEvent.click(reset);
    expect(box().value).toBe(MISSED.default);
    expect(reset).toBeDisabled();
  });

  it("appointment reminders preview the CONFIRM code and warn when cut", () => {
    render(<Harness template={APPT} />);
    expect(screen.getByTestId("sms-preview")).toHaveTextContent(
      "See you 12/01/2026 09:00 AM CONFIRM 1234 to confirm.",
    );
    expect(screen.queryByText(/will be cut/)).not.toBeInTheDocument();

    fireEvent.change(box(), { target: { value: `{scheduled_date} {scheduled_time} ${"x".repeat(140)}` } });
    expect(screen.getByText(/will be cut/)).toBeInTheDocument();
  });
});
