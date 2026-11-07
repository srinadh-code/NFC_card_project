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

export function validateRecipients(recipients: CheckoutRecipient[], count: number) {
  const errors: RecipientErrors[] = []
  const cleaned = resizeRecipients(recipients, count).map((recipient, index) => {
    const full_name = recipient.full_name.trim().replace(/\s+/g, " ")
    const email = recipient.email.trim().toLowerCase()
    const rawPhone = recipient.phone.trim()
    const phone = rawPhone.replace(/[\s().-]/g, "")
    const entry: RecipientErrors = {}
    if (!full_name) entry.full_name = "Full Name is required."
    else if (full_name.length > 150 || /[\u0000-\u001f\u007f]/.test(recipient.full_name) || !/\p{L}/u.test(full_name)) entry.full_name = "Enter a valid full name."
    if (!email) entry.email = "Email Address is required."
    else if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) entry.email = "Please enter a valid email address."
    if (!phone) entry.phone = "Phone Number is required."
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
