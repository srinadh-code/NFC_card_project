import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { CartLine } from "@/types"

interface CartState {
  lines: CartLine[]
  couponCode: string | null
  discount: number
  addLine: (line: Omit<CartLine, "lineId">) => void
  updateQty: (lineId: string, qty: number) => void
  removeLine: (lineId: string) => void
  applyCoupon: (code: string) => { success: boolean; message: string }
  clearCart: () => void
  subtotal: () => number
}

const VALID_COUPONS: Record<string, number> = {
  NEXORA10: 0.1,
  WELCOME50: 50,
  FIRSTORDER: 0.15,
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      couponCode: null,
      discount: 0,
      addLine: (line) =>
        set((s) => {
          const existing = s.lines.find(
            (l) => l.productId === line.productId && l.color.name === line.color.name,
          )
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.lineId === existing.lineId ? { ...l, qty: l.qty + line.qty } : l,
              ),
            }
          }
          return {
            lines: [...s.lines, { ...line, lineId: `${line.productId}-${line.color.name}-${Date.now()}` }],
          }
        }),
      updateQty: (lineId, qty) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.lineId === lineId ? { ...l, qty: Math.max(1, qty) } : l)),
        })),
      removeLine: (lineId) => set((s) => ({ lines: s.lines.filter((l) => l.lineId !== lineId) })),
      applyCoupon: (code) => {
        const normalized = code.trim().toUpperCase()
        const rule = VALID_COUPONS[normalized]
        if (!rule) {
          set({ couponCode: null, discount: 0 })
          return { success: false, message: "Invalid or expired coupon code." }
        }
        const subtotal = get().subtotal()
        const discount = rule < 1 ? Math.round(subtotal * rule) : rule
        set({ couponCode: normalized, discount })
        return { success: true, message: `Coupon ${normalized} applied successfully!` }
      },
      clearCart: () => set({ lines: [], couponCode: null, discount: 0 }),
      subtotal: () => get().lines.reduce((sum, l) => sum + l.price * l.qty, 0),
    }),
    { name: "taplink-cart" },
  ),
)
