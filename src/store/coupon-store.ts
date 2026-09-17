import { create } from "zustand"
import { persist } from "zustand/middleware"

// Coupon entry is deliberately kept separate from cart *lines* (see
// cart-store.ts / hooks/useCart.ts): a coupon code isn't per-customer
// private data the way cart contents are, so it's fine as one small
// shared store rather than needing the guest/backend split — but it's
// still cleared on logout (see auth-store.ts's doLogout) so a discount
// one customer typed in never silently carries over and applies to the
// next customer who uses this browser.
export const VALID_COUPONS: Record<string, number> = {
  NEXORA10: 0.1,
  WELCOME50: 50,
  FIRSTORDER: 0.15,
}

interface CouponState {
  couponCode: string | null
  discount: number
  // Takes the caller's own current subtotal (computed from whichever cart
  // — guest or authenticated backend — is actually active) rather than
  // reading any cart state itself, so it never risks discounting against
  // the wrong customer's totals.
  applyCoupon: (code: string, subtotal: number) => { success: boolean; message: string }
  clearCoupon: () => void
}

export const useCouponStore = create<CouponState>()(
  persist(
    (set) => ({
      couponCode: null,
      discount: 0,
      applyCoupon: (code, subtotal) => {
        const normalized = code.trim().toUpperCase()
        const rule = VALID_COUPONS[normalized]
        if (!rule) {
          set({ couponCode: null, discount: 0 })
          return { success: false, message: "Invalid or expired coupon code." }
        }
        const discount = rule < 1 ? Math.round(subtotal * rule) : rule
        set({ couponCode: normalized, discount })
        return { success: true, message: `Coupon ${normalized} applied successfully!` }
      },
      clearCoupon: () => set({ couponCode: null, discount: 0 }),
    }),
    { name: "nexora-coupon" },
  ),
)
