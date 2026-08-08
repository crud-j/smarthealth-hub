"use client";

import {
  type ClipboardEvent,
  type KeyboardEvent,
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
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(OTP_LENGTH).fill(null));

  const focusInput = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, OTP_LENGTH - 1));
    inputRefs.current[clamped]?.focus();
  }, []);

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
          const newDigits = [...digits];
          newDigits[index] = "";
          updateDigits(newDigits);
        } else if (index > 0) {
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
      focusInput(Math.min(pasted.length, OTP_LENGTH - 1));
    },
    [updateDigits, focusInput]
  );

  return (
    <div
      role="group"
      aria-label="One-time password input"
      className="flex gap-2 justify-center"
    >
      {digits.map((digit, index) => {
        const isFocused = focusedIndex === index;

        const inputClass = [
          "w-11 h-14 text-center text-xl font-semibold rounded-lg border-2 transition-all",
          "focus:outline-none",
          disabled ? "opacity-50 cursor-not-allowed bg-slate-50" : "bg-white",
          hasError
            ? "border-red-400 bg-red-50 text-red-700"
            : isFocused
            ? "border-primary ring-2 ring-primary/20 text-slate-900"
            : digit
            ? "border-slate-300 text-slate-900"
            : "border-border text-slate-900",
        ]
          .filter(Boolean)
          .join(" ");

        return (
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
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex(null)}
            className={inputClass}
            suppressHydrationWarning
          />
        );
      })}
    </div>
  );
}
