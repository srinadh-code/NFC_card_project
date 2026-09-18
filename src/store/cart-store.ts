import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { CardType, CartLine } from "@/types"

// The single source of truth for "which card types can still be sold" is
// the CardType union itself (@/types) — Wooden/Custom/Review are the only
// values the backend's OrderItem.card_type ChoiceField accepts (see
// orders/serializers.py's ORDER_ITEM_CARD_TYPE_CHOICES; Classic and Premium
// were deliberately retired there). A cart persisted in localStorage from
// before a retirement can still hold an old line with a now-invalid
// cardType — nothing re-validates persisted JSON against the current type
// at runtime — so it must be filtered out here, once, rather than trusted
// all the way to checkout where it would 400.
const VALID_CARD_TYPES: readonly CardType[] = ["Wooden", "Custom", "Review"]

export function sanitizeCartLines(lines: CartLine[]): CartLine[] {
  return lines.filter((l) => (VALID_CARD_TYPES as readonly string[]).includes(l.cardType))
}

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
    {
      name: "taplink-cart",
      // Silently drops any line for a card type that's since been retired
      // (e.g. an old "Premium" line from before that product was removed)
      // the moment a returning customer's cart loads — not at checkout,
      // where it would otherwise be the first time anyone notices. Existing
      // valid lines (Wooden/Custom/Review) are untouched.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<CartState> | undefined
        return {
          ...currentState,
          ...persisted,
          lines: sanitizeCartLines(persisted?.lines ?? []),
        }
      },
    },
  ),
)
