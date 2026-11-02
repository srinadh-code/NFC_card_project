// ---------------------------------------------------------------------
// Custom fields (My Profile > Custom Fields) — the rules shared by the
// editor and every public-card template, kept in one place so the
// dashboard and the public card can't disagree about what's valid or
// what's shown. The backend applies the same rules (profiles
// CustomFieldBulkItemSerializer / PublicProfileSerializer.get_custom_fields).
// ---------------------------------------------------------------------
import type { CustomField } from "@/types"

// Same limits as the backend columns (profiles.models.CustomField).
export const CUSTOM_FIELD_LABEL_MAX = 100
export const CUSTOM_FIELD_VALUE_MAX = 255

/** Per-row messages, keyed by field id. */
export type CustomFieldErrors = Record<string, { label?: string; value?: string }>

/** A row must have both a label and a value, or neither (a completely
 * empty row is simply dropped on save). */
export function validateCustomFields(fields: CustomField[]): CustomFieldErrors {
  const errors: CustomFieldErrors = {}
  for (const field of fields) {
    const hasLabel = Boolean(field.label.trim())
    const hasValue = Boolean(field.value.trim())
    if (hasLabel && !hasValue) errors[field.id] = { value: "Please enter a value or remove this field." }
    else if (!hasLabel && hasValue) errors[field.id] = { label: "Please enter a label or remove this field." }
  }
  return errors
}

/** The custom fields a public card shows: both label and value filled,
 * in the customer's saved order. */
export function getPublicCustomFields(fields: CustomField[]): CustomField[] {
  return fields.filter((f) => f.label.trim() && f.value.trim()).sort((a, b) => a.order - b.order)
}

/** Fields already shown elsewhere in a template (e.g. Impact's featured
 * "Experience" row) — left out of Additional Information so nothing
 * appears twice. */
export function withoutFields(fields: CustomField[], ids: Iterable<string | undefined>): CustomField[] {
  const exclude = new Set(ids)
  return fields.filter((f) => !exclude.has(f.id))
}

/** First field whose label matches (case-insensitive) and has a value. */
export function findFieldByLabel(fields: CustomField[], label: string): CustomField | undefined {
  return fields.find((f) => f.label.trim().toLowerCase() === label.toLowerCase() && f.value.trim())
}
