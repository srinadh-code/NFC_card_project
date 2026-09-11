import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Validates a `?redirect=` target before it's ever passed to navigate().
 * Only a same-app relative path ("/orders", "/checkout") is allowed — this
 * blocks open-redirect payloads like "//evil.com" or "https://evil.com"
 * that a crafted login/register link could otherwise carry.
 */
export function sanitizeRedirect(path: string | null | undefined, fallback: string): string {
  if (!path) return fallback
  if (!path.startsWith("/") || path.startsWith("//")) return fallback
  return path
}

/** `mailto:` href, or undefined when there's no email to link to — never
 *  renders a broken `mailto:` link. */
export function buildMailtoHref(email: string | undefined | null): string | undefined {
  return email ? `mailto:${email}` : undefined
}

/** `tel:` href (digits/leading + only), or undefined when there's no phone
 *  number to link to — never renders a broken `tel:` link. */
export function buildTelHref(phone: string | undefined | null): string | undefined {
  const digits = phone?.replace(/[^\d+]/g, "") ?? ""
  return digits ? `tel:${digits}` : undefined
}

// ---------------------------------------------------------------------
// Password policy
// ---------------------------------------------------------------------

/**
 * The one place the password rules live on the frontend — the live checklist
 * (PasswordRequirements), the character counter and the submit guard all read
 * from here, so there is no second copy of these regexes to drift.
 *
 * This mirrors the backend policy in accounts/validators.py
 * (PasswordComplexityValidator) plus MinimumLengthValidator; the backend
 * remains the final source of truth, this only tells the user what it will
 * accept before they submit. Keep the two in sync.
 */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 12

export type PasswordRuleResult = {
  id: string
  label: string
  valid: boolean
}

// Uppercase IS required by this policy (not merely allowed) — keep this in
// sync with accounts/validators.py's PasswordComplexityValidator.
const PASSWORD_RULES: ReadonlyArray<{ id: string; label: string; test: (p: string) => boolean }> = [
  {
    id: "min",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "max",
    label: `Maximum ${PASSWORD_MAX_LENGTH} characters`,
    // Empty counts as unmet so a blank field never shows an all-green list.
    test: (p) => p.length > 0 && p.length <= PASSWORD_MAX_LENGTH,
  },
  { id: "lowercase", label: "Contains lowercase", test: (p) => /[a-z]/.test(p) },
  { id: "number", label: "Contains number", test: (p) => /[0-9]/.test(p) },
  // "Special" is defined as anything that isn't a letter or a digit — the
  // same definition the backend validator uses.
  { id: "special", label: "Contains special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
  { id: "uppercase", label: "Contains uppercase", test: (p) => /[A-Z]/.test(p) },
]

/** Evaluates every rule against `password`. Pure and cheap — safe to call on
 *  every keystroke for the live checklist. */
export function evaluatePassword(password: string): {
  results: PasswordRuleResult[]
  metCount: number
  valid: boolean
} {
  const results = PASSWORD_RULES.map(({ id, label, test }) => ({ id, label, valid: test(password) }))
  const metCount = results.filter((r) => r.valid).length
  return { results, metCount, valid: metCount === results.length }
}

/** True when `password` satisfies every rule. */
export function isPasswordValid(password: string): boolean {
  return evaluatePassword(password).valid
}

/**
 * One-line inline-error summary of whichever rules `password` currently
 * fails — for forms that show a single message under the field (e.g. the
 * Forgot Password → Reset Password dialog) rather than the full live
 * checklist (Create Account's PasswordRequirements). Reads from the same
 * PASSWORD_RULES as evaluatePassword()/isPasswordValid(), so it can never
 * describe a different policy than what actually gets enforced. Returns ""
 * when the password already satisfies every rule.
 */
export function passwordRequirementsMessage(password: string): string {
  const unmet = evaluatePassword(password).results.filter((r) => !r.valid)
  if (unmet.length === 0) return ""
  const items = unmet.map((r) => r.label.charAt(0).toLowerCase() + r.label.slice(1))
  return `Password requirements not met: ${items.join(", ")}.`
}

// ---------------------------------------------------------------------
// Phone number policy
// ---------------------------------------------------------------------

/** The local phone number (country code entered separately, e.g. the fixed
 *  "+91" prefix on Create Account) must be exactly this many digits. */
export const PHONE_DIGITS = 10

/** True when `phone` is exactly PHONE_DIGITS numeric digits — no spaces,
 *  no country code, no punctuation. Mirrors the backend's RegisterSerializer
 *  phone validation; keep the two in sync. */
export function isTenDigitPhone(phone: string): boolean {
  return new RegExp(`^\\d{${PHONE_DIGITS}}$`).test(phone)
}
