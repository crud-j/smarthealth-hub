import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UseFormRegisterReturn } from "react-hook-form";
import { usePhilHealthMask } from "@/hooks/useInputMasks";

// PhilHealth No. (PIN) is 12 digits written 12-345678901-2. The mask put the
// second hyphen one place late, so a full number came out "12-3456789012-".

function typed(value: string): string {
  const onChange = vi.fn(async () => undefined);
  const reg = { name: "philhealthNo", onChange, onBlur: vi.fn(), ref: vi.fn() } as unknown as UseFormRegisterReturn;
  const masked = renderHook(() => usePhilHealthMask(reg)).result.current;
  const target = { value } as HTMLInputElement;
  void masked.onChange({ target } as unknown as Event);
  return target.value;
}

describe("usePhilHealthMask", () => {
  it.each([
    ["1", "1"],
    ["12", "12"],
    ["123", "12-3"],
    ["12345678901", "12-345678901"],
    ["123456789012", "12-345678901-2"],
    ["12-345678901-2", "12-345678901-2"],
    ["12 3456 78901 2", "12-345678901-2"],
    ["1234567890123", "12-345678901-2"], // capped at 12 digits
  ])("%s -> %s", (input, expected) => {
    expect(typed(input)).toBe(expected);
  });
});
