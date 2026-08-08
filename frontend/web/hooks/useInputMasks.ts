/**
 * Input mask hooks for SmartHealth Hub patient registration.
 *
 * These hooks intercept the onChange event from React Hook Form's register()
 * and transform the input value before it reaches the form state.
 * No external masking library is used.
 *
 * Exported hooks:
 *   usePhilHealthMask(register) — formats PhilHealth number as XX-XXXXXXXXXXX-X
 *   usePhMobileMask(register)   — normalizes Philippine mobile numbers
 *
 * Usage with React Hook Form:
 *   const maskedPhilHealth = usePhilHealthMask(register("philhealthNo"));
 *   <input {...maskedPhilHealth} />
 *
 *   const maskedMobile = usePhMobileMask(register("mobileNumber"));
 *   <input {...maskedMobile} />
 */

import type { UseFormRegisterReturn } from "react-hook-form";

// ---------------------------------------------------------------------------
// PhilHealth number mask: XX-XXXXXXXXXXX-X (12 digits, hyphens at pos 2 and 13)
// ---------------------------------------------------------------------------

/**
 * Wraps a React Hook Form register() return value for a PhilHealth number field.
 * Automatically inserts hyphens at positions 2 and 13 as the user types.
 *
 * The raw stored value (in form state) is the masked string, e.g. "12-345678901-2".
 * The backend strips hyphens during Pydantic validation (philhealth_no is a free
 * text field with max_length=20, so the masked format fits).
 *
 * Rules:
 * - Strip all non-numeric characters.
 * - Insert hyphen after the 2nd digit.
 * - Insert hyphen after the 11th digit (13th character in the masked string).
 * - Cap at 14 total characters (12 digits + 2 hyphens).
 */
export function usePhilHealthMask(
  registerReturn: UseFormRegisterReturn
): UseFormRegisterReturn {
  const originalOnChange = registerReturn.onChange;

  const maskedOnChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const raw = event.target.value;
    // Strip everything except digits
    const digits = raw.replace(/\D/g, "");
    // Cap at 12 digits
    const capped = digits.slice(0, 12);

    // Insert hyphens: XX-XXXXXXXXXXX-X
    let masked = capped;
    if (capped.length > 2) {
      masked = capped.slice(0, 2) + "-" + capped.slice(2);
    }
    if (capped.length > 11) {
      // After inserting the first hyphen, the 11th digit is at index 12
      masked = masked.slice(0, 13) + "-" + masked.slice(13);
    }

    // Mutate the synthetic event value so RHF receives the formatted string
    event.target.value = masked;
    return originalOnChange(event);
  };

  return {
    ...registerReturn,
    onChange: maskedOnChange,
  };
}

// ---------------------------------------------------------------------------
// Philippine mobile number mask: 09XXXXXXXXX or +639XXXXXXXXX
// ---------------------------------------------------------------------------

/**
 * Wraps a React Hook Form register() return value for a Philippine mobile
 * number field. Strips non-numeric characters on input (except for a leading +).
 *
 * The stored value passes through unchanged to the Zod validator, which
 * accepts both 09XXXXXXXXX and +639XXXXXXXXX formats.
 *
 * Rules:
 * - Strip characters that are not digits or leading '+'.
 * - Do NOT auto-prefix or reformat — the Zod schema already accepts both formats
 *   and provides an error message with the correct format hint.
 * - Cap at 13 characters (+639XXXXXXXXX = 13 chars).
 */
export function usePhMobileMask(
  registerReturn: UseFormRegisterReturn
): UseFormRegisterReturn {
  const originalOnChange = registerReturn.onChange;

  const maskedOnChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const raw = event.target.value;

    let cleaned: string;
    if (raw.startsWith("+")) {
      // Keep the leading + and strip everything else that is not a digit
      cleaned = "+" + raw.slice(1).replace(/\D/g, "");
      // Cap at +63 + 10 digits = 13 chars
      cleaned = cleaned.slice(0, 13);
    } else {
      // Local format: strip all non-digits, cap at 11 chars (09XXXXXXXXX)
      cleaned = raw.replace(/\D/g, "").slice(0, 11);
    }

    event.target.value = cleaned;
    return originalOnChange(event);
  };

  return {
    ...registerReturn,
    onChange: maskedOnChange,
  };
}
