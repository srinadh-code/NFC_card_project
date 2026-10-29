import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Gift, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cartApi } from "@/lib/api"
import { useCart } from "@/hooks/useCart"
import { formatCurrency, formatDate } from "@/lib/mock-api"
import { usePublicSettings } from "@/hooks/usePublicSettings"

/**
 * Checkout's "Offers & Discounts" section. Every number here comes from
 * the backend (common/discounts.py via customer_cart.services.
 * available_offers) — this only ever displays what's already discounting
 * the cart or explains why something isn't, it never computes a discount
 * itself. An automatic offer needs no action from the customer (it's
 * already in `applied`); a promo code is the one thing the customer can
 * actually apply/remove here, mirroring Cart.tsx's own promo code box.
 */
export function OffersSection({ enabled }: { enabled: boolean }) {
  const { settings } = usePublicSettings()
  const {
    promoCode,
    promoCodeError,
    applyPromoCode,
    removePromoCode,
    isApplyingPromo,
    applyOffer,
    removeOffer,
    isApplyingOffer,
  } = useCart()
  const [promoInput, setPromoInput] = useState("")

  const offersQuery = useQuery({
    queryKey: ["cart-offers"],
    queryFn: cartApi.availableOffers,
    enabled,
  })

  async function handleApplyPromo() {
    if (!promoInput.trim()) {
      toast.error("Please enter a promo code.")
      return
    }
    const result = await applyPromoCode(promoInput.trim())
    if (result.success) {
      toast.success(result.message)
      setPromoInput("")
    } else {
      toast.error(result.message)
    }
  }

  async function handleApplyOffer(offerId: number) {
    const result = await applyOffer(offerId)
    if (result.success) toast.success(result.message)
    else toast.error(result.message)
  }

  if (!enabled) return null

  const applied = offersQuery.data?.applied ?? []
  const available = offersQuery.data?.available ?? []
  const unavailable = offersQuery.data?.unavailable ?? []

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Gift className="size-4 text-primary" /> Offers &amp; Discounts
      </h2>

      <div className="mt-4 space-y-3">
        {offersQuery.isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : (
          <>
            {applied.map((offer) => (
              <div key={offer.id} className="rounded-xl border border-success/30 bg-success/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-success">🎉 {offer.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {offer.discount_type === "PERCENTAGE"
                        ? `${offer.discount_value}% OFF`
                        : `${formatCurrency(offer.discount_value, settings.currency)} OFF`}
                      {" — "}
                      {/* Automatic offers need no customer action at all — no
                          Apply button, and (per the project's "no manual
                          activation for the normal flow" requirement) no
                          Remove button either, since there's nothing the
                          customer did to undo. A typed promo code or a
                          manual "Apply Offer" click is the one thing that
                          IS undoable, via the button below. */}
                      {offer.can_remove ? "Applied" : "Automatically applied"}
                    </p>
                    {offer.end_at && (
                      <p className="mt-1 text-xs text-muted-foreground">Valid until {formatDate(offer.end_at)}</p>
                    )}
                  </div>
                  {offer.can_remove && !offer.promo_code && (
                    <Button type="button" variant="ghost" size="sm" onClick={removeOffer}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {available.map((offer) => (
              <div key={offer.id} className="flex items-center justify-between gap-3 rounded-xl border p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">🎉 {offer.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {offer.discount_type === "PERCENTAGE"
                      ? `${offer.discount_value}% OFF`
                      : `${formatCurrency(offer.discount_value, settings.currency)} OFF`}
                  </p>
                  {offer.end_at && (
                    <p className="mt-1 text-xs text-muted-foreground">Valid until {formatDate(offer.end_at)}</p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleApplyOffer(offer.id)}
                  disabled={isApplyingOffer}
                >
                  {isApplyingOffer ? "Applying..." : "Apply Offer"}
                </Button>
              </div>
            ))}

            {unavailable.map((offer) => (
              <div key={offer.id} className="rounded-xl border border-dashed p-4 text-sm">
                <p className="font-medium text-foreground">
                  {offer.title} <span className="text-muted-foreground">— Not Applicable</span>
                </p>
                <p className="text-muted-foreground">{offer.reason}</p>
              </div>
            ))}

          </>
        )}

        {/* A typed promo code is a distinct, opt-in mechanism (an offer the
            Admin configured to need one) — never the way a normal,
            automatic offer gets applied, so it's shown low-key and only
            surfaces on its own action, never as a "no offers" prompt. */}
        {promoCode ? (
          <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/5 px-4 py-3">
            <p className="text-sm">
              Promo code <span className="font-mono font-semibold">{promoCode.toUpperCase()}</span> applied.
              {promoCodeError && <span className="ml-2 text-xs text-destructive">{promoCodeError}</span>}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={removePromoCode}>
              Remove
            </Button>
          </div>
        ) : (
          <details className="group text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground">
              <Tag className="size-3.5" /> Have a promo code?
            </summary>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Enter promo code"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={handleApplyPromo} disabled={isApplyingPromo}>
                {isApplyingPromo ? "Applying..." : "Apply"}
              </Button>
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
