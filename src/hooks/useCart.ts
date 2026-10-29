import { useEffect, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCustomerAuthStore } from "@/store/auth-store"
import { useCartStore } from "@/store/cart-store"
import { ApiError, cartApi, CARD_TYPE_MAP, type ApiCartItem } from "@/lib/api"
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
    finalPrice: item.final_price != null ? Number(item.final_price) : undefined,
    discountAmount: item.discount_amount != null ? Number(item.discount_amount) : undefined,
    offerTitle: item.offer_title,
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

  // Real, backend-validated promo code — see common/discounts.py. Applying
  // IS the validation (no separate "check" step): a rejected code is
  // never stored, so there's no window where the UI shows a code that
  // isn't actually in effect.
  const applyPromoMutation = useMutation({
    mutationFn: (code: string) => cartApi.applyPromoCode(code),
    onSuccess: (cart) => {
      queryClient.setQueryData(["cart", customer?.id], cart)
      queryClient.invalidateQueries({ queryKey: ["cart-offers"] })
    },
  })
  const removePromoMutation = useMutation({
    mutationFn: () => cartApi.removePromoCode(),
    onSuccess: (cart) => {
      queryClient.setQueryData(["cart", customer?.id], cart)
      queryClient.invalidateQueries({ queryKey: ["cart-offers"] })
    },
  })

  // The "Apply Offer" button — for an offer with no promo code (see
  // ApiOfferOption). Also invalidates the offers list itself: applying one
  // moves it from `available` into `applied` there.
  const applyOfferMutation = useMutation({
    mutationFn: (offerId: number) => cartApi.applyOffer(offerId),
    onSuccess: (cart) => {
      queryClient.setQueryData(["cart", customer?.id], cart)
      queryClient.invalidateQueries({ queryKey: ["cart-offers"] })
    },
  })
  const removeOfferMutation = useMutation({
    mutationFn: () => cartApi.removeOffer(),
    onSuccess: (cart) => {
      queryClient.setQueryData(["cart", customer?.id], cart)
      queryClient.invalidateQueries({ queryKey: ["cart-offers"] })
    },
  })

  const backendLines = (cartQuery.data?.items ?? []).map(toFrontendCartLine)
  const lines = customer ? backendLines : guestLines
  const subtotal = () =>
    customer && cartQuery.data ? cartQuery.data.subtotal : lines.reduce((sum, l) => sum + l.price * l.qty, 0)
  // A guest (pre-login) cart has no server row to price a promo code (or
  // the first-order discount) against — real discounts only exist once
  // there's a real backend cart, so these are all 0/false rather than
  // ever guessing client-side.
  const discount = customer && cartQuery.data ? cartQuery.data.discount : 0
  const promotionalDiscount = customer && cartQuery.data ? cartQuery.data.promotional_discount : 0
  const firstOrderDiscountAmount = customer && cartQuery.data ? cartQuery.data.first_order_discount_amount : 0
  const firstOrderDiscountPercentage = customer && cartQuery.data ? cartQuery.data.first_order_discount_percentage : null
  const isFirstOrder = customer && cartQuery.data ? cartQuery.data.is_first_order : false
  const total = customer && cartQuery.data ? cartQuery.data.total : subtotal()

  return {
    lines,
    isLoading: customer ? cartQuery.isLoading : false,
    subtotal,
    discount,
    promotionalDiscount,
    firstOrderDiscountAmount,
    firstOrderDiscountPercentage,
    isFirstOrder,
    total,
    promoCode: customer ? (cartQuery.data?.promo_code ?? "") : "",
    promoCodeError: customer ? (cartQuery.data?.promo_code_error ?? null) : null,
    applyPromoCode: async (code: string) => {
      if (!customer) return { success: false, message: "Log in to apply a promo code." }
      try {
        await applyPromoMutation.mutateAsync(code)
        return { success: true, message: "Promo code applied." }
      } catch (err) {
        return { success: false, message: err instanceof ApiError ? err.message : "Couldn't apply that code." }
      }
    },
    removePromoCode: () => customer && removePromoMutation.mutate(),
    isApplyingPromo: applyPromoMutation.isPending,
    applyOffer: async (offerId: number) => {
      if (!customer) return { success: false, message: "Log in to apply this offer." }
      try {
        await applyOfferMutation.mutateAsync(offerId)
        return { success: true, message: "Offer applied." }
      } catch (err) {
        return { success: false, message: err instanceof ApiError ? err.message : "Couldn't apply that offer." }
      }
    },
    removeOffer: () => customer && removeOfferMutation.mutate(),
    isApplyingOffer: applyOfferMutation.isPending,
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
