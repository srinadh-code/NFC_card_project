import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCartStore } from "@/store/cart-store"
import { formatCurrency } from "@/lib/mock-api"
import { usePublicSettings } from "@/hooks/usePublicSettings"

export default function Cart() {
  const navigate = useNavigate()
  const { lines, updateQty, removeLine, applyCoupon, subtotal, couponCode, discount } = useCartStore()
  const [coupon, setCoupon] = useState("")
  const { settings } = usePublicSettings()

  const sub = subtotal()
  const shipping = sub === 0 ? 0 : sub > 999 ? 0 : 49
  const total = Math.max(0, sub + shipping - discount)

  function handleApplyCoupon() {
    if (!coupon.trim()) {
      toast.error("Please enter a coupon code.")
      return
    }
    const result = applyCoupon(coupon)
    if (result.success) {
      toast.success(result.message)
    } else {
      toast.error(result.message)
    }
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
                    <TableCell>{formatCurrency(line.price, settings.currency)}</TableCell>
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
                    <TableCell className="font-medium">{formatCurrency(line.price * line.qty, settings.currency)}</TableCell>
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

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Enter coupon code (e.g. NEXORA10)"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
            />
            <Button variant="outline" onClick={handleApplyCoupon}>
              Apply Coupon
            </Button>
          </div>
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
            {couponCode && (
              <div className="flex justify-between text-success">
                <span>Discount ({couponCode})</span>
                <span>- {formatCurrency(discount, settings.currency)}</span>
              </div>
            )}
            <div className="border-t pt-3 flex justify-between text-base font-semibold text-foreground">
              <span>Total</span>
              <span>{formatCurrency(total, settings.currency)}</span>
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
