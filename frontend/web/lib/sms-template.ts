/**
 * SMS reminder template rules and preview for the System Configuration page.
 *
 * Mirrors backend `app/services/sms_templates.py` (`template_problems`) and
 * the scheduler's appointment-reminder suffix. The backend check is
 * authoritative; this only gives the admin feedback while typing.
 */

export interface TemplateRules {
  placeholders: string[]
  required: string[]
  maxLength: number
}

type Part = { kind: "text"; text: string } | { kind: "field"; raw: string }

/** Split like Python's string.Formatter().parse; null if braces are unmatched. */
function parse(text: string): Part[] | null {
  const parts: Part[] = []
  let literal = ""
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === "{" && text[i + 1] === "{") { literal += "{"; i += 2; continue }
    if (ch === "}" && text[i + 1] === "}") { literal += "}"; i += 2; continue }
    if (ch === "}") return null
    if (ch === "{") {
      // Find the matching "}" (a format spec may nest one level of braces).
      let depth = 1
      let j = i + 1
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++
        else if (text[j] === "}") depth--
        j++
      }
      if (depth !== 0) return null
      if (literal) { parts.push({ kind: "text", text: literal }); literal = "" }
      parts.push({ kind: "field", raw: text.slice(i + 1, j - 1) })
      i = j
      continue
    }
    literal += ch
    i++
  }
  if (literal) parts.push({ kind: "text", text: literal })
  return parts
}

function splitField(raw: string): { name: string; extra: boolean } {
  const cut = raw.search(/[!:]/)
  return cut === -1 ? { name: raw, extra: false } : { name: raw.slice(0, cut), extra: true }
}

export function templateProblems(text: string, rules: TemplateRules): string[] {
  if (!text.trim()) return ["Cannot be empty"]
  const problems: string[] = []
  if (text.length > rules.maxLength) problems.push(`At most ${rules.maxLength} characters`)

  const parts = parse(text)
  if (parts === null) return [...problems, "Unmatched { or } (write {{ or }} for a literal brace)"]

  const used = new Set<string>()
  for (const part of parts) {
    if (part.kind !== "field") continue
    const { name, extra } = splitField(part.raw)
    if (!rules.placeholders.includes(name)) {
      problems.push(
        `Unknown placeholder {${name}}. Use: ` + rules.placeholders.map((p) => `{${p}}`).join(", "),
      )
      continue
    }
    if (extra) problems.push(`{${name}} cannot have formatting`)
    used.add(name)
  }
  for (const name of rules.required) {
    if (!used.has(name)) problems.push(`Must include {${name}}`)
  }
  return problems
}

const CONFIRM_SUFFIX = " CONFIRM 1234 to confirm."

/**
 * The SMS as a patient would receive it, filled with `values`. With a
 * `sendLimit` (appointment reminders) it is cut like the scheduler does and
 * the confirmation code is appended (always 160 characters or fewer).
 */
export function previewSms(text: string, values: Record<string, string>, sendLimit: number | null): string {
  const parts = parse(text)
  let message = parts === null
    ? text
    : parts.map((p) => {
        if (p.kind === "text") return p.text
        const { name } = splitField(p.raw)
        return values[name] ?? `{${p.raw}}`
      }).join("")
  if (sendLimit !== null) {
    if (message.length > sendLimit) message = message.slice(0, sendLimit - 3).trimEnd() + "..."
    message += CONFIRM_SUFFIX
  }
  return message
}

/** Roughly how many SMS a message of `length` characters takes (160, then 153 per part). */
export function smsParts(length: number): number {
  return length <= 160 ? 1 : Math.ceil(length / 153)
}
