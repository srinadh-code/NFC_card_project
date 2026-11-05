import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import type { VerificationChannel } from "@/lib/api"

// Matches payments/verification.py TOKEN_LIFETIME — after that the backend
// refuses the token anyway, so the guest is sent back to verify again.
const TOKEN_LIFETIME_MS = 30 * 60 * 1000

export interface VerifiedContact {
  channel: VerificationChannel
  /** Email address, or 10-digit mobile number. */
  destination: string
  token: string
  verifiedAt: number
}

export interface CheckoutRecipient {
  full_name: string
  email: string
}

interface CheckoutVerificationState {
  /** Random id of this browser checkout; OTPs and tokens are bound to it on the backend. */
  sessionRef: string
  contact: VerifiedContact | null
  /** The email verified at checkout when the guest first verified by mobile. */
  email: VerifiedContact | null
  bulkRecipientCount: number | null
  recipients: CheckoutRecipient[]
  recipientDetailsConfirmed: boolean
  setContact: (contact: VerifiedContact) => void
  setEmail: (email: VerifiedContact | null) => void
  beginBulkCheckout: (count: 3 | 5) => void
  resetBulkCheckout: () => void
  setRecipients: (recipients: CheckoutRecipient[]) => void
  confirmRecipients: () => void
  clearVerification: () => void
  clear: () => void
}

const newRef = () => crypto.randomUUID()

/**
 * Guest checkout verification (Verify Your Contact page → checkout). Kept in
 * sessionStorage: it survives a reload or a detour to the shop, but not the
 * tab. This only remembers what the backend already verified — checkout
 * creation re-checks every token server-side (payments/services.py).
 */
export const useCheckoutVerificationStore = create<CheckoutVerificationState>()(
  persist(
    (set) => ({
      sessionRef: newRef(),
      contact: null,
      email: null,
      bulkRecipientCount: null,
      recipients: [],
      recipientDetailsConfirmed: false,
      setContact: (contact) => set({ contact, email: contact.channel === "EMAIL" ? contact : null }),
      setEmail: (email) => set({ email }),
      beginBulkCheckout: (count) =>
        set({
          sessionRef: newRef(),
          contact: null,
          email: null,
          bulkRecipientCount: count,
          recipients: Array.from({ length: count }, () => ({ full_name: "", email: "" })),
          recipientDetailsConfirmed: false,
        }),
      resetBulkCheckout: () =>
        set({ bulkRecipientCount: null, recipients: [], recipientDetailsConfirmed: false }),
      setRecipients: (recipients) => set({ recipients, recipientDetailsConfirmed: false }),
      confirmRecipients: () => set({ recipientDetailsConfirmed: true }),
      clearVerification: () => set({ contact: null, email: null, sessionRef: newRef() }),
      // A fresh session ref too, so old tokens can't be reused.
      clear: () =>
        set({
          contact: null,
          email: null,
          sessionRef: newRef(),
          bulkRecipientCount: null,
          recipients: [],
          recipientDetailsConfirmed: false,
        }),
    }),
    { name: "vrs-checkout-verification", storage: createJSONStorage(() => sessionStorage) },
  ),
)

// Persist the session ref right away (persist only writes on change), so a
// reload between "Send OTP" and "Verify OTP" keeps the same ref the code
// was issued for. Storage is synchronous, so the store is already hydrated.
useCheckoutVerificationStore.setState((state) => ({ sessionRef: state.sessionRef }))

export function isFresh(contact: VerifiedContact | null): contact is VerifiedContact {
  return Boolean(contact && Date.now() - contact.verifiedAt < TOKEN_LIFETIME_MS)
}
