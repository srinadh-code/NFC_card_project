import { useEffect, useRef, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AlertCircle, CheckCircle2, Info, Loader2, MapPin, Pencil, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { AddressFormDialog } from "@/components/customer/AddressFormDialog"
import { PinnedLocationLink } from "@/components/customer/PinnedLocationLink"
import { validateRecipients, resizeRecipients, validCardQuantity, type CheckoutRecipient, type RecipientErrors } from "@/lib/checkout-recipients"
import { useCheckoutVerificationStore } from "@/store/checkout-verification-store"
import { BulkRecipientFields } from "@/components/checkout/BulkRecipientFields"
import { useRecipientEmailAvailability } from "@/hooks/useRecipientEmailAvailability"
import { OffersSection } from "@/components/checkout/OffersSection"
import { DesignerContactNotice } from "@/components/checkout/DesignerContactNotice"
import { GuestCheckout } from "@/components/checkout/GuestCheckout"
import { DummyPaymentDialog } from "@/components/checkout/DummyPaymentDialog"
import { useCart } from "@/hooks/useCart"
import { sanitizeCartLines } from "@/store/cart-store"
import { useCustomerAuthStore } from "@/store/auth-store"
import {
  ordersApi,
  customerAddressApi,
  paymentsApi,
  ApiError,
  type CreateOrderPayload,
  type RazorpayCheckout,
  type VerifiedPayment,
} from "@/lib/api"
import { PaymentCancelled, PaymentFailed, payWithRazorpay } from "@/lib/razorpay"
import { formatCurrency } from "@/lib/mock-api"
import { usePublicSettings } from "@/hooks/usePublicSettings"
import { cn } from "@/lib/utils"
import type { CustomerAddress } from "@/types"
import { storeOrderSuccess } from "@/pages/public/OrderSuccess"

// The customer's delivery address now always comes from their saved
// address book (customerAddressApi — see components/customer/
// AddressFormDialog.tsx) rather than being typed fresh on every order.
// Placing an order sends `address_id`; the backend copies that address's
// fields into the order's own shipping_* snapshot columns exactly once
// (see orders/services.py's compose_shipping_snapshot) — editing or
// deleting the saved address afterward never changes a past order.
function AddressOption({
  address,
  selected,
  onSelect,
}: {
  address: CustomerAddress
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col items-start gap-1 rounded-xl border p-4 text-left text-sm transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{address.label || "Address"}</span>
        {address.isDefault && <span className="text-xs font-medium text-primary">DEFAULT</span>}
      </span>
      <span className="text-foreground">{address.fullName}</span>
      <span className="text-muted-foreground">
        {[address.addressLine1, address.locality].filter(Boolean).join(", ")}
      </span>
      <span className="text-muted-foreground">
        {[address.city, address.state].filter(Boolean).join(", ")} - {address.pincode}
      </span>
    </button>
  )
}

export default function Checkout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const customer = useCustomerAuthStore((s) => s.customer)
  const {
    lines,
    subtotal,
    promotionalDiscount,
    firstOrderDiscountAmount,
    firstOrderDiscountPercentage,
    isFirstOrder,
    total: cartTotal,
    promoCode,
    clearCart,
    isLoading: cartLoading,
  } = useCart()
  const { settings } = usePublicSettings()

  const [purchaserContact, setPurchaserContact] = useState({ full_name: customer?.name ?? "", phone: customer?.phone ?? "" })
  const [purchaserErrors, setPurchaserErrors] = useState<RecipientErrors>({})
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<"summary" | "address" | "confirmation">("summary")
  const detailsRef = useRef<HTMLDivElement | null>(null)
  const recipientDetailsRef = useRef<HTMLDivElement | null>(null)
  const orderSummaryRef = useRef<HTMLDivElement | null>(null)
  const { recipients: bulkRecipients, setRecipients: setBulkRecipients } = useCheckoutVerificationStore()
  const recipientEmailAvailability = useRecipientEmailAvailability(bulkRecipients, customer?.email ?? "")
  const [recipientErrors, setRecipientErrors] = useState<RecipientErrors[]>([])
  // Set -> the form dialog edits this address (e.g. to fix a PIN code that
  // failed verification); null -> it adds a new one.
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null)

  // One id per checkout attempt (this page mount) — sent on every submit so
  // a double-click or retry resends the *same* id, letting the backend
  // recognize the resend and return the original order instead of creating
  // a second one (see orders/views.py CustomerOrderListCreateView.post). A
  // fresh id is only generated by mounting this page again (e.g. after a
  // successful order navigates away and the user starts a new one).
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  const addressesQuery = useQuery({
    queryKey: ["customer-addresses"],
    queryFn: customerAddressApi.list,
    enabled: Boolean(customer),
  })
  const addresses = addressesQuery.data ?? []

  // Auto-select the default address the first time addresses load (or the
  // first one if none is flagged default) — the customer can still pick a
  // different saved address before placing the order.
  useEffect(() => {
    if (selectedAddressId) return
    if (addresses.length === 0) return
    const preferred = addresses.find((a) => a.isDefault) ?? addresses[0]
    setSelectedAddressId(preferred.id)
  }, [addresses, selectedAddressId])

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null

  // The only source of "verified" on this page: the backend re-checks the
  // selected address's PIN code against India Post every time it changes
  // (customer_addresses CustomerAddressVerifyView). Order creation repeats
  // the same check server-side, so this only gates the button/message.
  const verificationQuery = useQuery({
    queryKey: [
      "address-verification",
      selectedAddress?.id,
      selectedAddress?.pincode,
      selectedAddress?.city,
      selectedAddress?.district,
      selectedAddress?.state,
    ],
    queryFn: () => customerAddressApi.verify(selectedAddress!.id),
    enabled: Boolean(selectedAddress),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const verification = verificationQuery.data
  const addressVerified = Boolean(selectedAddress) && verification?.verified === true && !verificationQuery.isFetching

  const validLines = sanitizeCartLines(lines)
  const bulkRecipientCount = validLines.reduce((sum, line) => sum + line.qty, 0)

  useEffect(() => {
    if (!customer || cartLoading || !validCardQuantity(bulkRecipientCount)) return
    if (bulkRecipients.length !== bulkRecipientCount) setBulkRecipients(resizeRecipients(bulkRecipients, bulkRecipientCount))
  }, [customer, cartLoading, bulkRecipientCount, bulkRecipients, setBulkRecipients])

  function markDetailsChanged() {
    setCheckoutStep((step) => step === "confirmation" ? "address" : step)
  }

  function updateBulkRecipient(index: number, field: keyof CheckoutRecipient, value: string) {
    const next = [...bulkRecipients]
    next[index] = { ...next[index], [field]: value }
    setBulkRecipients(next)
    setRecipientErrors((previous) => previous.map((entry, slot) => slot === index ? { ...entry, [field]: undefined } : entry))
    markDetailsChanged()
  }

  function returnToRecipientDetails() {
    setCheckoutStep("summary")
    recipientEmailAvailability.retry()
    recipientDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function validateBulkRecipients() {
    const result = validateRecipients(bulkRecipients, bulkRecipientCount)
    setRecipientErrors(result.errors)
    if (!result.valid) {
      toast.error("Please complete each recipient's name, valid email and phone number. Orders support 1 to 10 cards.")
      return null
    }
    if (!recipientEmailAvailability.allAvailable) {
      toast.error("Please wait until every recipient email is confirmed as available.")
      return null
    }
    return result.recipients
  }

  const sub = subtotal()
  // The live Order backend doesn't model a separate shipping charge yet —
  // the total shown here must match exactly what gets recorded server-side
  // (subtotal minus discount, both already computed by common/discounts.py
  // via the cart's own `total`/`discount`), so no shipping fee is added on
  // top and nothing here is recomputed client-side.
  const total = cartTotal

  // Online payment (Razorpay) when configured; otherwise the existing
  // pay-on-confirmation order flow below.
  const paymentConfig = useQuery({ queryKey: ["payments-config"], queryFn: paymentsApi.config, staleTime: 60_000 })
  const [paying, setPaying] = useState(false)
  // Temporary test payment (until Razorpay is live) waiting for confirmation.
  const [dummyCheckout, setDummyCheckout] = useState<RazorpayCheckout | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [dummyError, setDummyError] = useState<string | null>(null)

  function finishOrder(result: VerifiedPayment) {
    clearCart()
    const successState = {
      orderId: String(result.order_id),
      orderNumber: result.order_number,
      trackingToken: result.tracking_token,
      customerName: customer?.name,
      testPayment: result.payment_method === "DUMMY",
    }
    storeOrderSuccess(successState)
    navigate("/order-success", {
      replace: true,
      state: successState,
    })
  }

  async function confirmDummyPayment() {
    if (!dummyCheckout || confirming) return
    setConfirming(true)
    setDummyError(null)
    try {
      // Idempotent on the backend: a repeated click returns the same order.
      finishOrder(await paymentsApi.confirmDummyPayment(dummyCheckout.checkout_id, dummyCheckout.amount))
    } catch (err) {
      if (err instanceof ApiError && err.errors.recipients) {
        setDummyCheckout(null)
        returnToRecipientDetails()
        toast.error(err.message)
      }
      setDummyError(err instanceof Error ? err.message : "Couldn't confirm the payment. Please try again.")
    } finally {
      setConfirming(false)
    }
  }

  async function payOnline(addressId: number, recipients: CheckoutRecipient[], purchaser: { full_name: string; phone: string }) {
    setPaying(true)
    let checkoutId: string | null = null
    try {
      if (!paymentConfig.data?.enabled && paymentConfig.data?.dummy_enabled) {
        setDummyError(null)
        setDummyCheckout(await paymentsApi.createCustomerCheckout(addressId, "dummy", recipients, purchaser))
        return
      }
      const checkout = await paymentsApi.createCustomerCheckout(addressId, "razorpay", recipients, purchaser)
      checkoutId = checkout.checkout_id
      const paid = await payWithRazorpay(checkout, settings.site_name)
      finishOrder(await paymentsApi.verifyPayment(paid))
    } catch (err) {
      if (err instanceof PaymentCancelled || err instanceof PaymentFailed) {
        try {
          if (checkoutId) await paymentsApi.cancelCheckout(checkoutId)
          if (err instanceof PaymentCancelled) toast.info("Payment cancelled. You can try again whenever you're ready.")
          else toast.error(err.message)
        } catch {
          toast.error("The payment window closed, but we couldn't release this checkout. Please try again.")
        }
      }
      else {
        toast.error(err instanceof Error ? err.message : "Something went wrong with the payment.")
        if (err instanceof ApiError && err.errors.recipients) returnToRecipientDetails()
      }
      if (err instanceof ApiError && err.errors.address_id) {
        queryClient.invalidateQueries({ queryKey: ["address-verification"] })
      }
    } finally {
      setPaying(false)
    }
  }

  const placeOrderMutation = useMutation({
    mutationFn: (payload: CreateOrderPayload) => ordersApi.create(payload),
    onSuccess: (order) => {
      clearCart()
      navigate("/order-success", {
        state: {
          orderId: String(order.id),
          orderNumber: order.order_number,
          trackingToken: order.tracking_token,
          customerName: customer?.name,
        },
      })
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Something went wrong placing your order."
      toast.error(message)
      if (err instanceof ApiError && err.errors.recipients) returnToRecipientDetails()
      // The backend rejected the address at order time — refresh the
      // on-page status so it shows the real reason instead of "verified".
      if (err instanceof ApiError && err.errors.address_id) {
        queryClient.invalidateQueries({ queryKey: ["address-verification"] })
      }
    },
  })

  if (!customer) {
    // No account yet: verify by OTP, enter details and pay online. The
    // account is created automatically after the payment is verified.
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Checkout</h1>
        <div className="mt-8">
          <GuestCheckout />
        </div>
      </div>
    )
  }

  // Razorpay when configured; otherwise the temporary test payment where the
  // backend allows it; otherwise the pay-on-confirmation order below.
  const onlinePayment = Boolean(paymentConfig.data?.enabled || paymentConfig.data?.dummy_enabled)
  const busy = placeOrderMutation.isPending || paying

  function handleAddressSaved(address: CustomerAddress) {
    queryClient.invalidateQueries({ queryKey: ["customer-addresses"] })
    queryClient.invalidateQueries({ queryKey: ["address-verification"] })
    setSelectedAddressId(address.id)
    setSelectorOpen(false)
    markDetailsChanged()
  }

  function openAddressForm(address: CustomerAddress | null) {
    setEditingAddress(address)
    setFormOpen(true)
    markDetailsChanged()
  }

  function validateCheckoutDetails(recipients: CheckoutRecipient[]) {
    if (lines.length === 0) {
      toast.error("Your cart is empty.")
      return null
    }
    if (!selectedAddress) {
      toast.error("Please select or add a delivery address.")
      return null
    }
    if (!addressVerified) {
      toast.error("Please correct your delivery address before placing the order.")
      return null
    }

    if (validLines.length === 0) {
      toast.error("Your cart no longer contains any available products. Please add an item to continue.")
      return null
    }

    if (!customer) return null
    const purchaserResult = validateRecipients([{ ...purchaserContact, email: customer.email }], 1)
    setPurchaserErrors(purchaserResult.errors[0])
    if (!purchaserResult.valid) {
      toast.error("Enter the purchaser's full name and a valid phone number.")
      return null
    }
    const purchaser = { full_name: purchaserResult.recipients[0].full_name, phone: purchaserResult.recipients[0].phone }

    return { purchaser, recipients, address: selectedAddress }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const recipients = validateBulkRecipients()
    if (recipients === null) {
      recipientDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }
    if (onlinePayment && checkoutStep === "summary") {
      setCheckoutStep("address")
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }

    const validation = validateCheckoutDetails(recipients)
    if (!validation) {
      if (onlinePayment && checkoutStep !== "summary") detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }

    const { purchaser, recipients: bulkValidation, address } = validation
    if (onlinePayment && checkoutStep === "address") {
      setCheckoutStep("confirmation")
      orderSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }

    if (onlinePayment) {
      payOnline(Number(address.id), bulkValidation, purchaser)
      return
    }

    placeOrderMutation.mutate({
      idempotency_key: idempotencyKey,
      purchaser_contact: purchaser,
      items: validLines.map((l) => ({
        product_id: l.productId,
        name: l.name,
        card_type: l.cardType.toUpperCase(),
        color: l.color.name,
        qty: l.qty,
        price: l.price,
      })),
      recipients: bulkValidation.length ? bulkValidation : undefined,
      shipping: 0,
      // No payment gateway is wired up yet (see the note below the billing
      // form) — orders are placed as Cash on Delivery / pay-on-confirmation
      // until one exists, so there's nothing for the customer to pick here.
      payment_method: "COD",
      address_id: Number(address.id),
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Checkout</h1>

      <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-8 lg:grid-cols-3">
        <div ref={detailsRef} className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border bg-card p-6 shadow-sm" aria-labelledby="purchaser-heading">
            <h2 id="purchaser-heading" className="text-lg font-semibold text-foreground">Purchaser contact</h2>
            <p className="mt-2 text-sm text-muted-foreground">Order confirmations go to your signed-in email. Delivery and recipient details are entered separately.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="purchaser-name" className="text-sm font-medium">Full Name</label>
                <Input id="purchaser-name" required autoComplete="billing name" value={purchaserContact.full_name}
                  onChange={(event) => { setPurchaserContact((previous) => ({ ...previous, full_name: event.target.value })); setPurchaserErrors((previous) => ({ ...previous, full_name: undefined })); markDetailsChanged() }}
                  aria-invalid={Boolean(purchaserErrors.full_name)} />
                {purchaserErrors.full_name && <p className="text-sm text-destructive">{purchaserErrors.full_name}</p>}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="purchaser-email" className="text-sm font-medium">Email Address</label>
                <Input id="purchaser-email" type="email" readOnly value={customer.email} autoComplete="billing email" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="purchaser-phone" className="text-sm font-medium">Phone Number</label>
                <Input id="purchaser-phone" type="tel" required autoComplete="billing tel" value={purchaserContact.phone}
                  onChange={(event) => { setPurchaserContact((previous) => ({ ...previous, phone: event.target.value })); setPurchaserErrors((previous) => ({ ...previous, phone: undefined })); markDetailsChanged() }}
                  aria-invalid={Boolean(purchaserErrors.phone)} />
                {purchaserErrors.phone && <p className="text-sm text-destructive">{purchaserErrors.phone}</p>}
              </div>
            </div>
          </section>
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <MapPin className="size-4 text-primary" /> Delivery Address
              </h2>
              {addresses.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => { setSelectorOpen((v) => !v); markDetailsChanged() }}>
                  {selectorOpen ? "Close" : "Change Address"}
                </Button>
              )}
            </div>

            {addressesQuery.isLoading ? (
              <div className="mt-4 space-y-2">
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : addressesQuery.isError ? (
              <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center">
                <p className="text-sm text-muted-foreground">Unable to load your saved addresses.</p>
                <Button variant="outline" size="sm" onClick={() => addressesQuery.refetch()}>
                  Retry
                </Button>
              </div>
            ) : addresses.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
                <p className="text-sm font-medium text-foreground">No delivery address found.</p>
                <Button type="button" onClick={() => openAddressForm(null)}>
                  <Plus className="size-4" /> Add Delivery Address
                </Button>
              </div>
            ) : selectorOpen ? (
              <div className="mt-4 flex flex-col gap-2">
                {addresses.map((address) => (
                  <AddressOption
                    key={address.id}
                    address={address}
                    selected={address.id === selectedAddressId}
                    onSelect={() => {
                      setSelectedAddressId(address.id)
                      setSelectorOpen(false)
                      markDetailsChanged()
                    }}
                  />
                ))}
                <Button type="button" variant="outline" className="mt-1" onClick={() => openAddressForm(null)}>
                  <Plus className="size-4" /> Add New Address
                </Button>
              </div>
            ) : selectedAddress ? (
              <div className="mt-4 space-y-0.5 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">
                  {selectedAddress.label || "Address"}
                  {selectedAddress.isDefault && (
                    <span className="ml-2 text-xs font-medium text-primary">DEFAULT</span>
                  )}
                </p>
                <p className="font-medium text-foreground">{selectedAddress.fullName}</p>
                <p>{selectedAddress.addressLine1}</p>
                {selectedAddress.addressLine2 && <p>{selectedAddress.addressLine2}</p>}
                {selectedAddress.landmark && <p>Near {selectedAddress.landmark}</p>}
                <p>{[selectedAddress.locality, selectedAddress.city].filter(Boolean).join(", ")}</p>
                <p>{selectedAddress.district} District</p>
                <p>
                  {selectedAddress.state} - {selectedAddress.pincode}
                </p>
                <p>{selectedAddress.country}</p>
                <p>Delivery phone: {selectedAddress.phone}</p>
                <PinnedLocationLink address={selectedAddress} />
                <div className="pt-2" aria-live="polite">
                  {verificationQuery.isFetching ? (
                    <p className="flex items-center gap-1.5">
                      <Loader2 className="size-3.5 animate-spin" /> Verifying PIN code and address…
                    </p>
                  ) : verification?.verified ? (
                    <div className="space-y-0.5">
                      <p className="flex items-center gap-1.5 text-success">
                        <CheckCircle2 className="size-3.5" /> Address details verified
                      </p>
                      <p className="text-xs">
                        PIN {selectedAddress.pincode} serves{" "}
                        {[verification.matched_place || selectedAddress.city, verification.location?.state]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                      {verification.district_note && <p className="text-xs">{verification.district_note}</p>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="flex items-start gap-1.5 text-destructive">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        {verification
                          ? (verification.errors.pincode ??
                            Object.values(verification.errors)[0] ??
                            "This address could not be verified.")
                          : verificationQuery.error instanceof ApiError
                            ? verificationQuery.error.message
                            : "We couldn't verify your PIN code right now. Please try again in a moment."}
                      </p>
                      {verification ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openAddressForm(selectedAddress)}
                        >
                          <Pencil className="size-3.5" /> Edit Address
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" size="sm" onClick={() => verificationQuery.refetch()}>
                          Retry
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {bulkRecipientCount >= 1 && (
            <div ref={recipientDetailsRef}>
              <BulkRecipientFields
                count={bulkRecipientCount}
                recipients={bulkRecipients}
                errors={recipientErrors}
                emailStatuses={recipientEmailAvailability.statuses}
                onRetryEmailCheck={recipientEmailAvailability.retry}
                onChange={updateBulkRecipient}
              />
            </div>
          )}

          <OffersSection enabled={lines.length > 0} />

          {isFirstOrder && firstOrderDiscountAmount > 0 && (
            <div className="rounded-2xl border border-success/30 bg-success/5 p-4 text-sm">
              <p className="font-semibold text-success">🎉 First Order Offer</p>
              <p className="mt-0.5 text-muted-foreground">
                {firstOrderDiscountPercentage}% OFF applied automatically to your first order!
              </p>
            </div>
          )}

          {!onlinePayment && (
            <div className="flex items-start gap-2 rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              <p>
                Online payment isn&apos;t available yet — placing an order reserves your card and our team will
                contact you to confirm payment and shipping.
              </p>
            </div>
          )}
        </div>

        <div ref={orderSummaryRef} className="h-fit rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Order Summary</h2>
          {bulkRecipientCount > 0 && !validCardQuantity(bulkRecipientCount) && <p role="alert" className="mt-3 text-sm text-destructive">Orders support 1 to 10 cards. Update your cart quantity before checkout.</p>}
          <div className="mt-4 space-y-2 border-b pb-4 text-sm">
            {lines.map((l) => (
              <div key={l.lineId} className="flex justify-between text-muted-foreground">
                <span>
                  {l.name} × {l.qty}
                  {l.discountAmount ? <span className="ml-1 text-xs text-success">(offer applied)</span> : null}
                </span>
                <span className="text-foreground">
                  {formatCurrency((l.finalPrice ?? l.price) * l.qty, settings.currency)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="text-foreground">{formatCurrency(sub, settings.currency)}</span>
            </div>
            {promotionalDiscount > 0 && (
              <div className="flex justify-between text-success">
                <span>Promotional Discount{promoCode ? ` (${promoCode.toUpperCase()})` : ""}</span>
                <span>- {formatCurrency(promotionalDiscount, settings.currency)}</span>
              </div>
            )}
            {firstOrderDiscountAmount > 0 && (
              <div className="flex justify-between text-success">
                <span>First Order Discount</span>
                <span>- {formatCurrency(firstOrderDiscountAmount, settings.currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 text-base font-semibold text-foreground">
              <span>Total</span>
              <span>{formatCurrency(total, settings.currency)}</span>
            </div>
          </div>
          {onlinePayment && checkoutStep === "confirmation" && (
            <section aria-label="Order Confirmation and Payment Details" className="mt-5 space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
              <h3 className="font-semibold text-foreground">Order Confirmation / Payment Details</h3>
              <div>
                <p className="font-medium text-foreground">Purchaser</p>
                <p>{purchaserContact.full_name.trim()} · {customer.email} · {purchaserContact.phone}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Delivery</p>
                {selectedAddress && (
                  <>
                    <p>{selectedAddress.fullName} · {selectedAddress.phone}</p>
                    <p>{[selectedAddress.addressLine1, selectedAddress.addressLine2].filter(Boolean).join(", ")}</p>
                    <p>{[selectedAddress.landmark, selectedAddress.locality, selectedAddress.city, selectedAddress.district, selectedAddress.state, selectedAddress.pincode].filter(Boolean).join(", ")}</p>
                  </>
                )}
              </div>
              {bulkRecipients.length > 0 && (
                <div>
                  <p className="font-medium text-foreground">Recipients</p>
                  {bulkRecipients.map((recipient, index) => (
                    <p key={index}>{recipient.full_name} · {recipient.email} · {recipient.phone}</p>
                  ))}
                </div>
              )}
              <p className="text-muted-foreground">Review these details and the order amount before continuing to payment.</p>
            </section>
          )}
          <DesignerContactNotice className="mt-6" />
          <Button type="submit" size="lg" className="mt-4 w-full" disabled={busy || !validCardQuantity(bulkRecipientCount) || !recipientEmailAvailability.allAvailable || (!onlinePayment && !addressVerified)}>
            {busy ? (onlinePayment ? "Processing…" : "Placing Order…") : onlinePayment ? "Pay Now" : "Place Order"}
          </Button>
        </div>
      </form>

      <DummyPaymentDialog
        checkout={dummyCheckout}
        email={customer.email}
        delivery={{
          fullName: selectedAddress?.fullName ?? customer.name,
          phone: selectedAddress?.phone ?? "",
          lines: selectedAddress
            ? [
                [selectedAddress.addressLine1, selectedAddress.addressLine2].filter(Boolean).join(", "),
                [selectedAddress.landmark, selectedAddress.locality].filter(Boolean).join(", "),
                [selectedAddress.city, selectedAddress.district && `Dist. ${selectedAddress.district}`].filter(Boolean).join(", "),
                `${selectedAddress.state} - ${selectedAddress.pincode}`,
              ].filter((line) => line.trim())
            : [],
        }}
        currency={settings.currency}
        confirming={confirming}
        error={dummyError}
        onConfirm={confirmDummyPayment}
        onCancel={() => setDummyCheckout(null)}
      />

      <AddressFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        address={editingAddress}
        onSaved={handleAddressSaved}
      />
    </div>
  )
}
