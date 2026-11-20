import { describe, expect, it } from "vitest";
import { textFieldChange } from "@/lib/text-field-change";

describe("textFieldChange", () => {
  it("returns undefined when the value did not change (field is not sent)", () => {
    expect(textFieldChange("Penicillin", "Penicillin")).toBeUndefined();
    expect(textFieldChange("Penicillin", "  Penicillin  ")).toBeUndefined();
    expect(textFieldChange(null, "")).toBeUndefined();
    expect(textFieldChange(undefined, "   ")).toBeUndefined();
    expect(textFieldChange(null, null)).toBeUndefined();
  });

  it("returns the trimmed new text when it changed", () => {
    expect(textFieldChange(null, " Shrimp ")).toBe("Shrimp");
    expect(textFieldChange("Penicillin", "Penicillin, Shrimp")).toBe("Penicillin, Shrimp");
  });

  it("returns null when an existing value was cleared (backend removes it)", () => {
    expect(textFieldChange("Penicillin", "")).toBeNull();
    expect(textFieldChange("Penicillin", "   ")).toBeNull();
    expect(textFieldChange("Penicillin", null)).toBeNull();
    expect(textFieldChange("Penicillin", undefined)).toBeNull();
  });
});
