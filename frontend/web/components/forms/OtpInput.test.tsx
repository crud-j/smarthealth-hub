/**
 * OtpInput component tests.
 *
 * SETUP REQUIRED — Jest and React Testing Library are not yet installed in this
 * project.  Run the following before executing these tests:
 *
 *   pnpm add -D jest jest-environment-jsdom @testing-library/react \
 *              @testing-library/user-event @testing-library/jest-dom \
 *              ts-jest @types/jest
 *
 * Then add a jest.config.ts (or jest.config.js) at frontend/web/:
 *
 *   import type { Config } from 'jest';
 *   const config: Config = {
 *     preset: 'ts-jest',
 *     testEnvironment: 'jsdom',
 *     setupFilesAfterFramework: ['@testing-library/jest-dom'],
 *     moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
 *   };
 *   export default config;
 *
 * And add to package.json scripts:
 *   "test": "jest"
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import OtpInput from "./OtpInput";

// ---------------------------------------------------------------------------
// Helper: render OtpInput with a jest.fn() onChange callback.
// ---------------------------------------------------------------------------

function renderOtpInput(onChange = jest.fn()) {
  render(<OtpInput onChange={onChange} />);

  // The component renders 6 inputs labelled "OTP digit N of 6".
  const inputs = [
    screen.getByRole("textbox", { name: "OTP digit 1 of 6" }),
    screen.getByRole("textbox", { name: "OTP digit 2 of 6" }),
    screen.getByRole("textbox", { name: "OTP digit 3 of 6" }),
    screen.getByRole("textbox", { name: "OTP digit 4 of 6" }),
    screen.getByRole("textbox", { name: "OTP digit 5 of 6" }),
    screen.getByRole("textbox", { name: "OTP digit 6 of 6" }),
  ] as HTMLInputElement[];

  return { inputs, onChange };
}

// ---------------------------------------------------------------------------
// Auto-advance tests
// ---------------------------------------------------------------------------

describe("OtpInput — auto-advance", () => {
  it("moves focus to the next input after typing a digit", async () => {
    const user = userEvent.setup();
    const { inputs } = renderOtpInput();

    await user.click(inputs[0]);
    await user.keyboard("3");

    // After typing digit 0, focus should be on input 1.
    expect(document.activeElement).toBe(inputs[1]);
    expect(inputs[0]).toHaveValue("3");
  });

  it("does not advance focus beyond the last input", async () => {
    const user = userEvent.setup();
    const { inputs } = renderOtpInput();

    // Fill inputs 0–4 so focus naturally lands on input 5.
    for (let i = 0; i < 5; i++) {
      await user.click(inputs[i]);
      await user.keyboard("1");
    }
    // Type into the last input.
    await user.keyboard("6");

    // Focus should remain on the last input (index 5).
    expect(document.activeElement).toBe(inputs[5]);
  });
});

// ---------------------------------------------------------------------------
// Backspace tests
// ---------------------------------------------------------------------------

describe("OtpInput — backspace navigation", () => {
  it("moves focus to the previous input on Backspace when current input is empty", async () => {
    const user = userEvent.setup();
    const { inputs } = renderOtpInput();

    // Type a digit into input 0 so focus advances to input 1.
    await user.click(inputs[0]);
    await user.keyboard("5");

    // Input 1 is now focused and empty. Pressing Backspace should move to input 0.
    await user.keyboard("{Backspace}");

    expect(document.activeElement).toBe(inputs[0]);
  });

  it("clears the current digit on Backspace when the input has a value", async () => {
    const user = userEvent.setup();
    const { inputs } = renderOtpInput();

    await user.click(inputs[0]);
    await user.keyboard("7");
    // Focus is now on input 1. Go back.
    await user.click(inputs[0]);
    await user.keyboard("{Backspace}");

    expect(inputs[0]).toHaveValue("");
    // Focus should remain on input 0 (cleared in place).
    expect(document.activeElement).toBe(inputs[0]);
  });
});

// ---------------------------------------------------------------------------
// onChange callback test
// ---------------------------------------------------------------------------

describe("OtpInput — onChange callback", () => {
  it("calls onChange with the 6-digit string when all inputs are filled", async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    const { inputs } = renderOtpInput(handleChange);

    const digits = ["1", "2", "3", "4", "5", "6"];
    for (let i = 0; i < 6; i++) {
      await user.click(inputs[i]);
      await user.keyboard(digits[i]);
    }

    expect(handleChange).toHaveBeenCalledWith("123456");
  });

  it("does not call onChange until all 6 digits are filled", async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    const { inputs } = renderOtpInput(handleChange);

    // Fill only 5 inputs.
    for (let i = 0; i < 5; i++) {
      await user.click(inputs[i]);
      await user.keyboard(`${i + 1}`);
    }

    expect(handleChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Paste support tests
// ---------------------------------------------------------------------------

describe("OtpInput — paste support", () => {
  it("fills all 6 inputs and calls onChange when a 6-digit string is pasted", async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    const { inputs } = renderOtpInput(handleChange);

    await user.click(inputs[0]);
    await user.paste("123456");

    inputs.forEach((input, i) => {
      expect(input).toHaveValue(String(i + 1));
    });
    expect(handleChange).toHaveBeenCalledWith("123456");
  });

  it("ignores non-digit characters in pasted text", async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    const { inputs } = renderOtpInput(handleChange);

    await user.click(inputs[0]);
    // Pasting "abc123456" should extract only the first 6 digits: "123456".
    await user.paste("abc123456");

    expect(inputs[0]).toHaveValue("1");
    expect(handleChange).toHaveBeenCalledWith("123456");
  });

  it("fills only available inputs when paste is shorter than 6 digits", async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    const { inputs } = renderOtpInput(handleChange);

    await user.click(inputs[0]);
    await user.paste("123");

    expect(inputs[0]).toHaveValue("1");
    expect(inputs[1]).toHaveValue("2");
    expect(inputs[2]).toHaveValue("3");
    expect(inputs[3]).toHaveValue("");
    // onChange should NOT fire yet (only 3/6 digits filled).
    expect(handleChange).not.toHaveBeenCalled();
  });
});
