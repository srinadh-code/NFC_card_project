// ---------------------------------------------------------------------
// Customer delivery address validation — frontend only.
//
// Reuses the project's existing PHONE_DIGITS/isTenDigitPhone() from
// lib/utils.ts rather than duplicating a phone regex. Field-specific
// checks below are deliberately lenient (see each function's comment) —
// the goal stated by this task is catching *obvious* garbage input
// ("asdfgh", "123456", "@@@@@@"), not deciding whether a real address
// physically exists.
// ---------------------------------------------------------------------
import { isTenDigitPhone } from "@/lib/utils"
import { INDIAN_STATES } from "@/data/indian-states"

function cleanLetters(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "")
}

// Common QWERTY keyboard rows (and their reverses) — used to catch
// keyboard-mash garbage like "asdfgh", "qwerty", "xcvbn", "fghjk" without
// flagging real words (no ordinary English/Indian place name contains a
// 5+ character run of adjacent keyboard-row letters).
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"]
const MASH_CHUNK_MIN = 5

function containsKeyboardMash(value: string): boolean {
  const cleaned = cleanLetters(value)
  if (cleaned.length < MASH_CHUNK_MIN) return false
  for (const row of KEYBOARD_ROWS) {
    const reversed = row.split("").reverse().join("")
    const maxLen = Math.min(cleaned.length, row.length)
    for (let len = maxLen; len >= MASH_CHUNK_MIN; len--) {
      for (let i = 0; i + len <= cleaned.length; i++) {
        const chunk = cleaned.slice(i, i + len)
        if (row.includes(chunk) || reversed.includes(chunk)) return true
      }
    }
  }
  return false
}

/** All-one-character strings ("xxxxx", "111111", "aaaaaa", "@@@@@@") once
 * whitespace is stripped. */
function isAllOneCharacter(value: string): boolean {
  const collapsed = value.replace(/\s+/g, "")
  return collapsed.length > 0 && /^(.)\1+$/.test(collapsed)
}

/** Shared "does this look like obvious garbage" pass used by every free-text
 * field below (address lines, city, district). Deliberately narrow: it only
 * rejects all-repeated characters and keyboard-mash runs, not any word it
 * doesn't recognize — legitimate but unusual place names still pass. */
export function isGarbageText(value: string): boolean {
  return isAllOneCharacter(value) || containsKeyboardMash(value)
}

export function validateName(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, " ")
  if (!value) return "Please enter your full name."
  if (value.length < 3) return "Full name is too short."
  if (value.length > 60) return "Full name is too long."
  if (!/^[A-Za-z]+(?:[\s.'-][A-Za-z]+)*$/.test(value)) {
    return "Full name can only contain letters and spaces."
  }
  if (isGarbageText(value)) return "Please enter a valid full name."
  return null
}

/** Strips spaces/dashes and an optional country code (+91 / 91 / a
 * leading trunk 0) down to the bare 10 digits, so "+91 98765 43210",
 * "91-9876543210" and "9876543210" all validate the same way. */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/[^\d]/g, "")
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1)
  return digits
}

export function validatePhone(raw: string): string | null {
  if (!raw.trim()) return "Please enter your mobile number."
  const normalized = normalizePhone(raw)
  if (!isTenDigitPhone(normalized)) return "Please enter a valid 10-digit mobile number."
  if (!/^[6-9]/.test(normalized)) return "Please enter a valid Indian mobile number."
  if (/^(\d)\1{9}$/.test(normalized)) return "Please enter a valid mobile number."
  return null
}

interface FreeTextRules {
  label: string
  minLength: number
  minLetters: number
  allowDigits: boolean
  optional?: boolean
}

function validateFreeText(raw: string, rules: FreeTextRules): string | null {
  const value = raw.trim()
  if (!value) return rules.optional ? null : `Please enter a valid ${rules.label}.`
  if (value.length < rules.minLength) return `Please enter a valid ${rules.label}.`
  if (!rules.allowDigits && /\d/.test(value)) return `Please enter a valid ${rules.label}.`
  if (cleanLetters(value).length < rules.minLetters) return `Please enter a valid ${rules.label}.`
  if (isGarbageText(value)) return `Please enter a valid ${rules.label}.`
  return null
}

// Address Line 1 legitimately contains house/flat/plot numbers ("H.No
// 4-25", "Plot No 12") so digits are allowed — only "no real letters at
// all" (pure digits/symbols) or garbage text is rejected.
export function validateAddressLine1(raw: string): string | null {
  return validateFreeText(raw, { label: "delivery address", minLength: 8, minLetters: 4, allowDigits: true })
}

export function validateAddressLine2(raw: string): string | null {
  return validateFreeText(raw, {
    label: "address line 2",
    minLength: 3,
    minLetters: 2,
    allowDigits: true,
    optional: true,
  })
}

export function validateLandmark(raw: string): string | null {
  return validateFreeText(raw, { label: "landmark", minLength: 3, minLetters: 2, allowDigits: true, optional: true })
}

export function validateVillage(raw: string): string | null {
  return validateFreeText(raw, {
    label: "village/locality",
    minLength: 2,
    minLetters: 2,
    allowDigits: false,
    optional: true,
  })
}

export function validateCity(raw: string): string | null {
  return validateFreeText(raw, { label: "city", minLength: 2, minLetters: 2, allowDigits: false })
}

export function validateDistrict(raw: string): string | null {
  return validateFreeText(raw, { label: "district", minLength: 2, minLetters: 2, allowDigits: false })
}

export function validateState(raw: string, validStates: string[] = INDIAN_STATES): string | null {
  const value = raw.trim()
  if (!value) return "Please select a valid state."
  if (!validStates.some((s) => s.toLowerCase() === value.toLowerCase())) {
    return "Please select a valid state."
  }
  return null
}

export function validatePincode(raw: string): string | null {
  const value = raw.trim()
  if (!value) return "Please enter your PIN code."
  if (!/^\d{6}$/.test(value)) return "PIN code must contain exactly 6 digits."
  if (/^(\d)\1{5}$/.test(value)) return "Please enter a valid PIN code."
  return null
}
