import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { CartLine } from "@/types"

// GUEST cart only — an unauthenticated visitor browsing /shop before
// logging in. This is the one piece of cart state that's genuinely safe
// to keep in localStorage: there's no "other customer" to leak to, since
// nobody is signed in yet. The moment a real customer session exists,
// hooks/useCart.ts stops reading/writing this store entirely and instead
// reads/writes that customer's real server-side cart
// (customer_management.customer_cart) — the previous shared bug was
// exactly this store being used as if it were also the authenticated
// cart, under one fixed key with no per-customer isolation at all.
//
// On login, any items sitting here get merged into the newly-authenticated
// customer's backend cart once (see useCart.ts), then this store is
// cleared. On logout, it's cleared again (see auth-store.ts's doLogout)
// so it never displays a previous customer's items to the next guest — or
// worse, to a *different* customer — who uses this browser next.
interface CartState {
  lines: CartLine[]
  addLine: (line: Omit<CartLine, "lineId">) => void
  updateQty: (lineId: string, qty: number) => void
  removeLine: (lineId: string) => void
  clearCart: () => void
  subtotal: () => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
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
      clearCart: () => set({ lines: [] }),
      subtotal: () => get().lines.reduce((sum, l) => sum + l.price * l.qty, 0),
    }),
    { name: "taplink-cart" },
  ),
)
