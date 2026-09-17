import { useEffect, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCustomerAuthStore } from "@/store/auth-store"
import { useCartStore } from "@/store/cart-store"
import { useCouponStore } from "@/store/coupon-store"
import { cartApi, CARD_TYPE_MAP, type ApiCartItem } from "@/lib/api"
import type { CardType, CartLine } from "@/types"

function toFrontendCartLine(item: ApiCartItem): CartLine {
  return {
    lineId: String(item.id),
    productId: item.product_id,
    name: item.name,
    cardType: CARD_TYPE_MAP[item.card_type] ?? "Custom",
    color: { name: item.color_name, hex: item.color_hex },
    qty: item.qty,
    price: Number(item.price),
  }
}

function toApiCartItem(line: Omit<CartLine, "lineId">) {
  return {
    product_id: line.productId,
    name: line.name,
    card_type: (line.cardType as CardType).toUpperCase(),
    color_name: line.color.name,
    color_hex: line.color.hex,
    qty: line.qty,
    price: line.price,
  }
}

// Module-level (not per-component) so the pre-login-guest-cart merge runs
// exactly once per login no matter how many components on the page call
// useCart() simultaneously (e.g. Navbar's badge + the Cart page itself) —
// a per-component useRef would let each mounted instance race to merge
// the same guest lines a second time.
let mergedForCustomerId: string | null = null

/**
 * The single interface every cart-consuming component uses — Navbar's
 * badge, Shop.tsx's "Add to Cart", Cart.tsx, and Checkout.tsx. Not logged
 * in: reads/writes the local guest store (cart-store.ts). Logged in:
 * reads/writes that customer's real backend cart
 * (customer_management.customer_cart, keyed by request.user server-side,
 * and by `["cart", customer.id]` here so React Query never serves one
 * customer's cached cart to another). Same returned shape either way, so
 * callers never need to know which source is active.
 */
export function useCart() {
  const customer = useCustomerAuthStore((s) => s.customer)
  const queryClient = useQueryClient()

  const guestLines = useCartStore((s) => s.lines)
  const guestAddLine = useCartStore((s) => s.addLine)
  const guestUpdateQty = useCartStore((s) => s.updateQty)
  const guestRemoveLine = useCartStore((s) => s.removeLine)
  const guestClearCart = useCartStore((s) => s.clearCart)

  const couponCode = useCouponStore((s) => s.couponCode)
  const discount = useCouponStore((s) => s.discount)
  const applyCouponRaw = useCouponStore((s) => s.applyCoupon)

  const cartQuery = useQuery({
    queryKey: ["cart", customer?.id],
    queryFn: cartApi.get,
    enabled: Boolean(customer),
  })

  const mergedGuestLinesRef = useRef(guestLines)
  mergedGuestLinesRef.current = guestLines

  useEffect(() => {
    if (!customer) return
    if (mergedForCustomerId === customer.id) return
    mergedForCustomerId = customer.id
    const lines = mergedGuestLinesRef.current
    if (lines.length === 0) return
    ;(async () => {
      for (const line of lines) {
        await cartApi.addItem(toApiCartItem(line))
      }
      guestClearCart()
      queryClient.invalidateQueries({ queryKey: ["cart", customer.id] })
      // eslint-disable-next-line no-empty
    })().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id])

  const addMutation = useMutation({
    mutationFn: (line: Omit<CartLine, "lineId">) => cartApi.addItem(toApiCartItem(line)),
    onSuccess: (cart) => queryClient.setQueryData(["cart", customer?.id], cart),
  })
  const updateMutation = useMutation({
    mutationFn: ({ lineId, qty }: { lineId: string; qty: number }) => cartApi.updateQty(Number(lineId), qty),
    onSuccess: (cart) => queryClient.setQueryData(["cart", customer?.id], cart),
  })
  const removeMutation = useMutation({
    mutationFn: (lineId: string) => cartApi.remove(Number(lineId)),
    onSuccess: (cart) => queryClient.setQueryData(["cart", customer?.id], cart),
  })

  const backendLines = (cartQuery.data?.items ?? []).map(toFrontendCartLine)
  const lines = customer ? backendLines : guestLines
  const subtotal = () => lines.reduce((sum, l) => sum + l.price * l.qty, 0)

  return {
    lines,
    isLoading: customer ? cartQuery.isLoading : false,
    subtotal,
    couponCode,
    discount,
    applyCoupon: (code: string) => applyCouponRaw(code, subtotal()),
    addLine: (line: Omit<CartLine, "lineId">) => {
      if (customer) addMutation.mutate(line)
      else guestAddLine(line)
    },
    updateQty: (lineId: string, qty: number) => {
      const nextQty = Math.max(1, qty)
      if (customer) updateMutation.mutate({ lineId, qty: nextQty })
      else guestUpdateQty(lineId, nextQty)
    },
    removeLine: (lineId: string) => {
      if (customer) removeMutation.mutate(lineId)
      else guestRemoveLine(lineId)
    },
    // The real clearing already happens server-side the moment an order
    // is created from this customer's cart (see orders/views.py) — this
    // just makes the frontend re-fetch so the UI reflects that.
    clearCart: () => {
      if (customer) queryClient.invalidateQueries({ queryKey: ["cart", customer.id] })
      else guestClearCart()
    },
  }
}
