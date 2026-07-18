"use client";

/**
 * OtpInput — 6-digit one-time password input component.
 *
 * Behaviour:
 *  - Renders 6 individual <input> elements, each accepting exactly 1 digit.
 *  - Typing a digit auto-advances focus to the next input.
 *  - Backspace on an empty input moves focus back to the previous input.
 *  - Pasting a 6-digit string (e.g. from an SMS notification) fills all inputs
 *    at once and fires `onChange` immediately.
 *  - `onChange(value)` fires when all 6 digits are filled, passing the
 *    complete 6-character string.
 *  - Each input has `aria-label="OTP digit N of 6"` for screen-reader access.
 *  - `inputMode="numeric"` and `pattern="[0-9]"` trigger the numeric keyboard
 *    on mobile devices.
 */

import {
  ClipboardEvent,
  KeyboardEvent,
  useCallback,
  useRef,
  useState,
} from "react";

const OTP_LENGTH = 6;

interface OtpInputProps {
  /** Called with the complete 6-digit string when all inputs are filled. */
  onChange: (value: string) => void;
  /** Whether the inputs should be disabled (e.g. during async submission). */
  disabled?: boolean;
  /** Whether to show an error state on all inputs. */
  hasError?: boolean;
}

export default function OtpInput({
  onChange,
  disabled = false,
  hasError = false,
}: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>(
    Array(OTP_LENGTH).fill(null)
  );

  const focusInput = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, OTP_LENGTH - 1));
    inputRefs.current[clamped]?.focus();
  }, []);

  /** Update digits array and fire onChange if all filled. */
  const updateDigits = useCallback(
    (newDigits: string[]) => {
      setDigits(newDigits);
      if (newDigits.every((d) => d !== "")) {
        onChange(newDigits.join(""));
      }
    },
    [onChange]
  );

  const handleChange = useCallback(
    (index: number, rawValue: string) => {
      // Accept only the last typed character and ensure it is a digit.
      const char = rawValue.replace(/\D/g, "").slice(-1);

      const newDigits = [...digits];
      newDigits[index] = char;
      updateDigits(newDigits);

      if (char !== "" && index < OTP_LENGTH - 1) {
        focusInput(index + 1);
      }
    },
    [digits, updateDigits, focusInput]
  );

  const handleKeyDown = useCallback(
    (index: number, event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace") {
        if (digits[index] !== "") {
          // Clear the current input.
          const newDigits = [...digits];
          newDigits[index] = "";
          updateDigits(newDigits);
        } else if (index > 0) {
          // Move focus to the previous input and clear it.
          const newDigits = [...digits];
          newDigits[index - 1] = "";
          updateDigits(newDigits);
          focusInput(index - 1);
        }
        event.preventDefault();
      } else if (event.key === "ArrowLeft" && index > 0) {
        focusInput(index - 1);
        event.preventDefault();
      } else if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
        focusInput(index + 1);
        event.preventDefault();
      }
    },
    [digits, updateDigits, focusInput]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      event.preventDefault();
      const pasted = event.clipboardData
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, OTP_LENGTH);

      if (pasted.length === 0) return;

      const newDigits = Array(OTP_LENGTH).fill("") as string[];
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i];
      }
      updateDigits(newDigits);

      // Move focus to the input after the last pasted digit.
      const nextFocus = Math.min(pasted.length, OTP_LENGTH - 1);
      focusInput(nextFocus);
    },
    [updateDigits, focusInput]
  );

  const baseInputStyle: React.CSSProperties = {
    width: "2.75rem",
    height: "3rem",
    textAlign: "center",
    fontSize: "1.25rem",
    fontWeight: 600,
    border: hasError ? "2px solid #ef4444" : "2px solid #e2e8f0",
    borderRadius: "0.5rem",
    outline: "none",
    transition: "border-color 0.15s ease",
    backgroundColor: disabled ? "#f8fafc" : "#ffffff",
    color: "#0f172a",
    cursor: disabled ? "not-allowed" : "text",
  };

  return (
    <div
      role="group"
      aria-label="One-time password input"
      style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]"
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`OTP digit ${index + 1} of ${OTP_LENGTH}`}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => {
            e.target.style.borderColor = hasError ? "#ef4444" : "#3b82f6";
            e.target.select();
          }}
          onBlur={(e) => {
            e.target.style.borderColor = hasError ? "#ef4444" : "#e2e8f0";
          }}
          style={baseInputStyle}
        />
      ))}
    </div>
  );
}
