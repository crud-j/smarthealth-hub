/**
 * What an edit form should send for an optional free-text field.
 *
 * - `undefined`: unchanged, so leave it out of the PUT body. This keeps the
 *   audit log's `changed_fields` honest (no "allergies changed" on every save).
 * - `null`: the user emptied a field that had a value. The backend clears
 *   `allergies` / `known_conditions` on an explicit null
 *   (`_CLEARABLE_TEXT_FIELDS` in `backend/app/services/patient_service.py`).
 * - `string`: the trimmed new value.
 */
export function textFieldChange(
  original: string | null | undefined,
  edited: string | null | undefined,
): string | null | undefined {
  const before = original?.trim() ?? "";
  const after = edited?.trim() ?? "";
  if (after === before) return undefined;
  return after === "" ? null : after;
}
