import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { useCart } from "@/hooks/useCart"
import { formatCurrency } from "@/lib/mock-api"
import { usePublicSettings } from "@/hooks/usePublicSettings"

export default function Cart() {
  const navigate = useNavigate()
  const {
    lines,
    updateQty,
    removeLine,
    subtotal,
    discount,
    total,
    promoCode,
    promoCodeError,
    applyPromoCode,
    removePromoCode,
    isApplyingPromo,
    isLoading,
  } = useCart()
  const [promoInput, setPromoInput] = useState("")
  const { settings } = usePublicSettings()

  const sub = subtotal()
  const shipping = sub === 0 ? 0 : sub > 999 ? 0 : 49
  const grandTotal = Math.max(0, total + shipping)

  async function handleApplyPromoCode() {
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

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShoppingCart className="size-10" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-foreground">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">Looks like you haven't added any cards yet.</p>
        <Button className="mt-8" size="lg" onClick={() => navigate("/shop")}>
          Browse Cards
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Your Cart</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.lineId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span
                          className="size-10 shrink-0 rounded-lg"
                          style={{ backgroundColor: line.color.hex }}
                        />
                        <div>
                          <p className="font-medium text-foreground">{line.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.cardType} · {line.color.name}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {line.discountAmount ? (
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground line-through">
                            {formatCurrency(line.price, settings.currency)}
                          </span>
                          <span className="font-medium text-success">
                            {formatCurrency(line.finalPrice ?? line.price, settings.currency)}
                          </span>
                        </div>
                      ) : (
                        formatCurrency(line.price, settings.currency)
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() => updateQty(line.lineId, line.qty - 1)}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-6 text-center">{line.qty}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() => updateQty(line.lineId, line.qty + 1)}
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency((line.finalPrice ?? line.price) * line.qty, settings.currency)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeLine(line.lineId)}
                        aria-label="Remove item"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {promoCode ? (
            <div className="mt-6 flex items-center justify-between rounded-lg border border-success/30 bg-success/5 px-4 py-3">
              <p className="text-sm">
                Promo code <span className="font-mono font-semibold">{promoCode.toUpperCase()}</span> applied.
                {promoCodeError && <span className="ml-2 text-xs text-destructive">{promoCodeError}</span>}
              </p>
              <Button variant="ghost" size="sm" onClick={removePromoCode}>
                Remove
              </Button>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Input
                placeholder="Enter promo code (e.g. DIWALI20)"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
              />
              <Button variant="outline" onClick={handleApplyPromoCode} disabled={isApplyingPromo}>
                {isApplyingPromo ? "Applying..." : "Apply Code"}
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Order Summary</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="text-foreground">{formatCurrency(sub, settings.currency)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span className="text-foreground">{shipping === 0 ? "Free" : formatCurrency(shipping, settings.currency)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-success">
                <span>Discount</span>
                <span>- {formatCurrency(discount, settings.currency)}</span>
              </div>
            )}
            <div className="border-t pt-3 flex justify-between text-base font-semibold text-foreground">
              <span>Total</span>
              <span>{formatCurrency(grandTotal, settings.currency)}</span>
            </div>
          </div>
          <Button className="mt-6 w-full" size="lg" onClick={() => navigate("/checkout")}>
            Proceed to Checkout
          </Button>
        </div>
      </div>
    </div>
  )
}
