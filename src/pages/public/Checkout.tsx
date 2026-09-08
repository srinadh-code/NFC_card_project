import { useEffect, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCartStore } from "@/store/cart-store"
import { useCustomerAuthStore } from "@/store/auth-store"
import { ordersApi, ApiError, type CreateOrderPayload } from "@/lib/api"
import { formatCurrency } from "@/lib/mock-api"

interface BillingForm {
  fullName: string
  phone: string
  address: string
  city: string
  state: string
  pincode: string
}

const INITIAL_FORM: BillingForm = {
  fullName: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
}

export default function Checkout() {
  const navigate = useNavigate()
  const customer = useCustomerAuthStore((s) => s.customer)
  const { lines, subtotal, couponCode, discount, clearCart } = useCartStore()

  const [form, setForm] = useState<BillingForm>(INITIAL_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof BillingForm, boolean>>>({})

  const placeOrderMutation = useMutation({
    mutationFn: (payload: CreateOrderPayload) => ordersApi.create(payload),
    onSuccess: (order) => {
      clearCart()
      navigate("/order-success", { state: { orderId: order.order_number } })
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Something went wrong placing your order."
      toast.error(message)
    },
  })

  // Redirecting an unauthenticated visitor is <ProtectedRoute role="CUSTOMER">'s
  // job (see App.tsx) — it wraps this route and never mounts this component
  // at all unless a real, token-backed customer session exists. `customer`
  // is only ever null here for a single render right after logout, before
  // the route transition away completes.
  useEffect(() => {
    if (customer) {
      setForm((f) => ({ ...f, fullName: f.fullName || customer.name }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id])

  const sub = subtotal()
  // The Order backend doesn't model a separate shipping charge yet — the
  // total shown here must match exactly what gets recorded server-side
  // (subtotal minus discount), so no shipping fee is added on top.
  const total = Math.max(0, sub - discount)

  if (!customer) {
    return null
  }

  function update<K extends keyof BillingForm>(key: K, value: BillingForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function validate(): boolean {
    const next: Partial<Record<keyof BillingForm, boolean>> = {}
    ;(Object.keys(form) as (keyof BillingForm)[]).forEach((key) => {
      if (!form[key].trim()) next[key] = true
    })
    setErrors(next)
    if (Object.keys(next).length > 0) {
      toast.error("Please fill in all required fields.")
      return false
    }
    return true
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (lines.length === 0) {
      toast.error("Your cart is empty.")
      return
    }
    if (!validate()) return

    placeOrderMutation.mutate({
      shipping_full_name: form.fullName,
      shipping_phone: form.phone,
      shipping_address: form.address,
      shipping_city: form.city,
      shipping_state: form.state,
      shipping_country: "India",
      shipping_postal_code: form.pincode,
      discount,
      items: lines.map((l) => ({
        card_type: l.cardType.toUpperCase(),
        color: l.color.name,
        quantity: l.qty,
        unit_price: l.price,
      })),
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Checkout</h1>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Billing Details</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                  aria-invalid={errors.fullName}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  aria-invalid={errors.phone}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pincode">Pincode</Label>
                <Input
                  id="pincode"
                  value={form.pincode}
                  onChange={(e) => update("pincode", e.target.value)}
                  aria-invalid={errors.pincode}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">Address Line</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  aria-invalid={errors.address}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => update("city", e.target.value)}
                  aria-invalid={errors.city}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={form.state}
                  onChange={(e) => update("state", e.target.value)}
                  aria-invalid={errors.state}
                />
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              Online payment isn&apos;t available yet — placing an order reserves your card and our team will
              contact you to confirm payment and shipping.
            </p>
          </div>
        </div>

        <div className="h-fit rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Order Summary</h2>
          <div className="mt-4 space-y-2 border-b pb-4 text-sm">
            {lines.map((l) => (
              <div key={l.lineId} className="flex justify-between text-muted-foreground">
                <span>
                  {l.name} × {l.qty}
                </span>
                <span className="text-foreground">{formatCurrency(l.price * l.qty)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="text-foreground">{formatCurrency(sub)}</span>
            </div>
            {couponCode && (
              <div className="flex justify-between text-success">
                <span>Discount ({couponCode})</span>
                <span>- {formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 text-base font-semibold text-foreground">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
          <Button type="submit" size="lg" className="mt-6 w-full" disabled={placeOrderMutation.isPending}>
            {placeOrderMutation.isPending ? "Placing Order…" : "Place Order"}
          </Button>
        </div>
      </form>
    </div>
  )
}
