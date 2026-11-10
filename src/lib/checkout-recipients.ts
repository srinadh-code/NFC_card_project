/** Shared checkout rules for card quantities and recipient contact snapshots. */
export const MAX_CARD_QTY = 10

export interface CheckoutRecipient {
  full_name: string
  email: string
  phone: string
}

export type RecipientErrors = Partial<Record<keyof CheckoutRecipient, string>>

export function clampQty(qty: number): number {
  if (!Number.isFinite(qty)) return 1
  return Math.min(MAX_CARD_QTY, Math.max(1, Math.round(qty)))
}

export function validCardQuantity(qty: number): boolean {
  return Number.isInteger(qty) && qty >= 1 && qty <= MAX_CARD_QTY
}

export const emptyRecipient = (): CheckoutRecipient => ({ full_name: "", email: "", phone: "" })

/** Slot positions are stable: changing quantity keeps every remaining entry. */
export function resizeRecipients(recipients: CheckoutRecipient[], count: number): CheckoutRecipient[] {
  return Array.from({ length: Math.max(0, Math.min(MAX_CARD_QTY, Math.trunc(count))) }, (_, index) => ({
    ...emptyRecipient(), ...recipients[index],
  }))
}

/**
 * Recipient mobile numbers: an Indian mobile number written as 9876543210,
 * 919876543210 or +919876543210. The 10-digit number must start with 6-9;
 * spaces, letters and other symbols are rejected. Mirrors
 * RECIPIENT_MOBILE_RE in backend/payments/services.py — keep the two in sync.
 */
export const RECIPIENT_PHONE_ERROR = "Enter a valid Indian mobile number with or without +91."
const INDIAN_MOBILE_RE = /^(?:\+91|91)?[6-9][0-9]{9}$/

export function isValidIndianMobile(value: string): boolean {
  return INDIAN_MOBILE_RE.test(value.trim())
}

/** Inline error while typing: blank is left to the Continue check ("required"). */
export function recipientPhoneLiveError(value: string): string | undefined {
  return value.trim() && !isValidIndianMobile(value) ? RECIPIENT_PHONE_ERROR : undefined
}

/**
 * Next recipient error list after one field changes: the edited field's error
 * is cleared, except the phone field, which is re-validated as the customer
 * types. Slots the list doesn't cover yet are filled with empty entries.
 */
export function recipientErrorsAfterChange(
  previous: RecipientErrors[],
  index: number,
  field: keyof CheckoutRecipient,
  value: string,
): RecipientErrors[] {
  const next = Array.from({ length: Math.max(previous.length, index + 1) }, (_, slot) => previous[slot] ?? {})
  next[index] = { ...next[index], [field]: field === "phone" ? recipientPhoneLiveError(value) : undefined }
  return next
}

/**
 * `indianMobilePhone` applies the recipient mobile rule above. Without it the
 * phone keeps the original 7-15 digit rule (the purchaser contact on the
 * signed-in checkout reuses this function and must stay unchanged).
 */
export function validateRecipients(
  recipients: CheckoutRecipient[],
  count: number,
  options: { indianMobilePhone?: boolean } = {},
) {
  const errors: RecipientErrors[] = []
  const cleaned = resizeRecipients(recipients, count).map((recipient, index) => {
    const full_name = recipient.full_name.trim().replace(/\s+/g, " ")
    const email = recipient.email.trim().toLowerCase()
    const rawPhone = recipient.phone.trim()
    // The recipient rule keeps the customer's value as typed (only trimmed).
    const phone = options.indianMobilePhone ? rawPhone : rawPhone.replace(/[\s().-]/g, "")
    const entry: RecipientErrors = {}
    if (!full_name) entry.full_name = "Full Name is required."
    else if (full_name.length > 150 || /[\u0000-\u001f\u007f]/.test(recipient.full_name) || !/\p{L}/u.test(full_name)) entry.full_name = "Enter a valid full name."
    if (!email) entry.email = "Email Address is required."
    else if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) entry.email = "Please enter a valid email address."
    if (!phone) entry.phone = "Phone Number is required."
    else if (options.indianMobilePhone) {
      if (!INDIAN_MOBILE_RE.test(phone)) entry.phone = RECIPIENT_PHONE_ERROR
    }
    else if (!/^\+?[0-9]{7,15}$/.test(phone)) entry.phone = "Enter a valid phone number with 7 to 15 digits, including country code if needed."
    errors[index] = entry
    return { full_name, email, phone }
  })
  const emailSlots = new Map<string, number[]>()
  cleaned.forEach((recipient, index) => {
    if (!recipient.email) return
    emailSlots.set(recipient.email, [...(emailSlots.get(recipient.email) ?? []), index])
  })
  for (const indexes of emailSlots.values()) {
    if (indexes.length < 2) continue
    for (const index of indexes) errors[index].email = "Use a different email address for each NFC card."
  }
  return {
    recipients: cleaned,
    errors,
    valid: validCardQuantity(count) && cleaned.length === count && errors.every((entry) => Object.keys(entry).length === 0),
  }
}
