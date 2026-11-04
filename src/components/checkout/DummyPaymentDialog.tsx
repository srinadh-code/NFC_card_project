import { FlaskConical, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/mock-api"
import type { RazorpayCheckout } from "@/lib/api"

export interface DeliverySummary {
  fullName: string
  phone: string
  lines: string[]
}

interface DummyPaymentDialogProps {
  checkout: RazorpayCheckout | null
  email: string
  delivery: DeliverySummary
  currency?: string
  confirming: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

/** Payment confirmation for the temporary test payment (until Razorpay is
 * live). Everything shown — products, quantities, amount — is what the
 * backend priced for this checkout, not the browser's own estimate. */
export function DummyPaymentDialog({
  checkout,
  email,
  delivery,
  currency = "INR",
  confirming,
  error,
  onConfirm,
  onCancel,
}: DummyPaymentDialogProps) {
  const money = (value: string | number) => formatCurrency(Number(value), currency)
  return (
    <Dialog open={checkout !== null} onOpenChange={(open) => !open && !confirming && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm Payment</DialogTitle>
          <DialogDescription>Review your order, then confirm the payment.</DialogDescription>
        </DialogHeader>

        {checkout && (
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-foreground">
              <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <span>
                <strong>Test payment.</strong> No money is charged — online payment is not live yet. Your order is saved
                as paid (test).
              </span>
            </div>

            <div className="rounded-xl border">
              {checkout.lines.map((line, i) => (
                <div key={i} className="flex items-start justify-between gap-3 border-b px-4 py-3 last:border-b-0">
                  <div>
                    <p className="font-medium text-foreground">{line.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Quantity: {line.qty} × {money(line.unit_price)}
                      {line.pricing_tier ? ` (${line.pricing_tier})` : ""}
                    </p>
                  </div>
                  <span className="font-medium text-foreground">{money(Number(line.unit_price) * line.qty)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{money(checkout.summary.subtotal)}</span>
              </div>
              {Number(checkout.summary.first_order_discount_amount) > 0 && (
                <div className="flex justify-between text-success">
                  <span>First order discount</span>
                  <span>−{money(checkout.summary.first_order_discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Shipping</span>
                <span>{Number(checkout.summary.shipping) > 0 ? money(checkout.summary.shipping) : "Free"}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold text-foreground">
                <span>Order amount</span>
                <span>{money(checkout.summary.total)}</span>
              </div>
            </div>

            <div className="grid gap-3 rounded-xl bg-muted/40 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</p>
                <p className="mt-1 break-all text-foreground">{email}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deliver to</p>
                <p className="mt-1 text-foreground">
                  {delivery.fullName} · {delivery.phone}
                </p>
                {delivery.lines.map((line, i) => (
                  <p key={i} className="text-muted-foreground">
                    {line}
                  </p>
                ))}
              </div>
            </div>

            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={confirming}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={confirming}>
            {confirming ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {confirming ? "Confirming…" : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
