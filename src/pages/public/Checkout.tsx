import { useEffect, useState, type FormEvent } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useCartStore } from "@/store/cart-store"
import { useCustomerAuthStore } from "@/store/auth-store"
import { useDataStore } from "@/store/data-store"
import { formatCurrency } from "@/lib/mock-api"
import type { Address, PaymentMethod, TrackingStep } from "@/types"

interface BillingForm {
  fullName: string
  email: string
  phone: string
  address: string
  city: string
  pincode: string
}

const INITIAL_FORM: BillingForm = {
  fullName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  pincode: "",
}

function buildTracking(): TrackingStep[] {
  const now = new Date().toISOString()
  return [
    { label: "Order Placed", date: now, done: true },
    { label: "Processing", date: null, done: false },
    { label: "Shipped", date: null, done: false },
    { label: "Out for Delivery", date: null, done: false },
    { label: "Delivered", date: null, done: false },
  ]
}

export default function Checkout() {
  const navigate = useNavigate()
  const customer = useCustomerAuthStore((s) => s.customer)
  const { lines, subtotal, couponCode, discount, clearCart } = useCartStore()
  const { addOrder, addTransaction } = useDataStore()

  const [form, setForm] = useState<BillingForm>(INITIAL_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof BillingForm, boolean>>>({})
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("UPI")

  // Ordering an NFC card requires an account — the order must be tied to a
  // real customer so it shows up on their dashboard immediately, and so an
  // admin can later assign/ship a physical card against it. Anyone who
  // isn't signed in gets sent to login and comes right back here after.
  useEffect(() => {
    if (customer) {
      setForm((f) => ({
        ...f,
        fullName: f.fullName || customer.name,
        email: f.email || customer.email,
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id])

  const sub = subtotal()
  const shipping = sub > 999 ? 0 : 49
  const total = Math.max(0, sub + shipping - discount)

  if (!customer) {
    return <Navigate to="/login" state={{ from: "/checkout" }} replace />
  }
  const authedCustomer = customer

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

    const address: Address = {
      line1: form.address,
      city: form.city,
      state: "",
      pincode: form.pincode,
      country: "India",
    }

    const order = addOrder({
      customerId: authedCustomer.id,
      customerName: form.fullName,
      customerEmail: form.email,
      customerPhone: form.phone,
      items: lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        cardType: l.cardType,
        color: l.color.name,
        qty: l.qty,
        price: l.price,
        customLogo: l.customLogo ?? undefined,
      })),
      amount: sub,
      shipping,
      total,
      paymentMethod,
      paymentStatus: "Paid",
      status: "Pending",
      date: new Date().toISOString(),
      address,
      assignedCardId: null,
      tracking: buildTracking(),
    })

    addTransaction({
      orderId: order.id,
      customerId: authedCustomer.id,
      customerName: form.fullName,
      amount: total,
      method: paymentMethod,
      status: "Paid",
      date: new Date().toISOString(),
    })

    clearCart()
    navigate("/order-success", { state: { orderId: order.id } })
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
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  aria-invalid={errors.email}
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
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Payment Method</h2>
            <RadioGroup
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              className="mt-4"
            >
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <RadioGroupItem value="UPI" id="pm-upi" />
                <Label htmlFor="pm-upi" className="flex-1 cursor-pointer font-normal">
                  UPI / QR Code
                </Label>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <RadioGroupItem value="Card" id="pm-card" />
                <Label htmlFor="pm-card" className="flex-1 cursor-pointer font-normal">
                  Credit / Debit Card
                </Label>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <RadioGroupItem value="Net Banking" id="pm-nb" />
                <Label htmlFor="pm-nb" className="flex-1 cursor-pointer font-normal">
                  Net Banking
                </Label>
              </div>
            </RadioGroup>
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
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span className="text-foreground">{shipping === 0 ? "Free" : formatCurrency(shipping)}</span>
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
          <Button type="submit" size="lg" className="mt-6 w-full">
            Place Order
          </Button>
        </div>
      </form>
    </div>
  )
}
