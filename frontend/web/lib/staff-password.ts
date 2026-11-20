/**
 * Staff password rules for the admin "Reset password" action.
 *
 * Mirrors the backend `AdminPasswordReset` schema (`schemas/user.py`), which
 * uses the same rules as changing your own password: 8-128 characters, at
 * least one uppercase letter and one digit. The backend check is
 * authoritative; this only gives the admin instant feedback.
 */

export function passwordProblems(password: string): string[] {
  const problems: string[] = []
  if (password.length < 8) problems.push("At least 8 characters")
  if (password.length > 128) problems.push("At most 128 characters")
  if (!/[A-Z]/.test(password)) problems.push("One uppercase letter")
  if (!/[0-9]/.test(password)) problems.push("One number")
  return problems
}

// No look-alikes (0/O, 1/l/I) so the password can be read aloud or copied
// from a screen without mistakes.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
const LOWER = "abcdefghijkmnpqrstuvwxyz"
const DIGITS = "23456789"
const ALL = UPPER + LOWER + DIGITS

function randomIndex(n: number): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % n
}

/** A random 12-character temporary password that meets `passwordProblems`. */
export function generateTempPassword(): string {
  const chars = [
    UPPER[randomIndex(UPPER.length)],
    DIGITS[randomIndex(DIGITS.length)],
    LOWER[randomIndex(LOWER.length)],
  ]
  while (chars.length < 12) chars.push(ALL[randomIndex(ALL.length)])
  // Fisher-Yates shuffle so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join("")
}
