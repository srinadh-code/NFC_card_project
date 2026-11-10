import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AlertCircle, LocateFixed, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DesignerContactNotice } from "@/components/checkout/DesignerContactNotice"
import { BulkRecipientFields, type BulkRecipientErrors } from "@/components/checkout/BulkRecipientFields"
import { useRecipientEmailAvailability } from "@/hooks/useRecipientEmailAvailability"
import { DummyPaymentDialog } from "@/components/checkout/DummyPaymentDialog"
import { OtpVerifier } from "@/components/checkout/OtpVerifier"
import { INDIAN_STATES } from "@/data/indian-states"
import { useCart } from "@/hooks/useCart"
import { usePublicSettings } from "@/hooks/usePublicSettings"
import {
  validateAddressLine1,
  validateCity,
  validateDistrict,
  validateName,
  validatePhone,
  validatePincode,
  validateState,
} from "@/lib/address-validation"
import {
  ApiError,
  customerAddressApi,
  paymentsApi,
  type GuestCheckoutInput,
  type RazorpayCheckout,
  type VerifiedPayment,
} from "@/lib/api"
import { formatCurrency } from "@/lib/mock-api"
import { PaymentCancelled, PaymentFailed, payWithRazorpay } from "@/lib/razorpay"
import { cn } from "@/lib/utils"
import { CurrentLocationError, detectAddressFromCurrentLocation, mergeDetectedAddress } from "@/lib/checkout-location"
import { resizeRecipients, validateRecipients, validCardQuantity, type CheckoutRecipient } from "@/lib/checkout-recipients"
import { isFresh, useCheckoutVerificationStore } from "@/store/checkout-verification-store"
import { storeOrderSuccess } from "@/pages/public/OrderSuccess"

interface AddressFields {
  address_line1: string
  address_line2: string
  landmark: string
  locality: string
  city: string
  district: string
  state: string
  pincode: string
}

const EMPTY_ADDRESS: AddressFields = {
  address_line1: "",
  address_line2: "",
  landmark: "",
  locality: "",
  city: "",
  district: "",
  state: "",
  pincode: "",
}

type Errors = Partial<Record<keyof AddressFields | "full_name" | "phone" | "email" | "delivery_phone", string>>

function firstError(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined
  return typeof value === "string" ? value : undefined
}

function Field({
  id,
  label,
  optional,
  error,
  children,
  className,
}: {
  id: string
  label: string
  optional?: boolean
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

/**
 * Checkout for visitors without an account. They arrive having verified
 * their email or mobile number on the Verify Your Contact page
 * (/checkout/verify); a mobile-verified guest also verifies an email here,
 * since that's where the order confirmation and login details go. After the
 * backend verifies the Razorpay payment it creates the order and — for a new
 * email — the customer account (payments/services.py).
 */
export function GuestCheckout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { settings } = usePublicSettings()
  const { lines, clearCart } = useCart()
  const config = useQuery({ queryKey: ["payments-config"], queryFn: paymentsApi.config, staleTime: 60_000 })

  const {
    sessionRef,
    contact,
    email: verifiedEmail,
    setEmail: setVerifiedEmail,
    recipients: savedRecipients,
    setRecipients: setSavedRecipients,
    clearVerification,
  } = useCheckoutVerificationStore()
  const viaMobile = contact?.channel === "SMS"
  const [emailInput, setEmailInput] = useState("")
  const [phone, setPhone] = useState(() => (contact?.channel === "SMS" ? contact.destination : ""))
  const [fullName, setFullName] = useState("")
  const [deliveryPhone, setDeliveryPhone] = useState("")
  const [address, setAddress] = useState<AddressFields>(EMPTY_ADDRESS)
  const [detectingLocation, setDetectingLocation] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const deliveryDetailsRef = useRef<HTMLElement | null>(null)
  const purchaserDetailsRef = useRef<HTMLElement | null>(null)
  const recipientDetailsRef = useRef<HTMLDivElement | null>(null)
  const orderSummaryRef = useRef<HTMLDivElement | null>(null)
  const [checkoutStep, setCheckoutStep] = useState<"summary" | "address" | "confirmation">("summary")
  const [errors, setErrors] = useState<Errors>({})
  const [bulkRecipients, setBulkRecipients] = useState<CheckoutRecipient[]>(savedRecipients)
  const availabilityBuyerEmail = viaMobile
    ? verifiedEmail?.destination ?? emailInput
    : contact?.destination ?? ""
  const recipientEmailAvailability = useRecipientEmailAvailability(bulkRecipients, availabilityBuyerEmail)
  const [recipientErrors, setRecipientErrors] = useState<BulkRecipientErrors>([])
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  // Temporary test payment (until Razorpay is live): the server-priced
  // checkout waiting for "Confirm Payment", and the details it was made for —
  // Pay Now with unchanged details reopens it instead of starting another.
  const [dummy, setDummy] = useState<{ checkout: RazorpayCheckout; key: string } | null>(null)
  const [dummyOpen, setDummyOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [dummyError, setDummyError] = useState<string | null>(null)

  const emailReady = isFresh(verifiedEmail)
  const pinOk = validatePincode(address.pincode) === null
  const pinLookup = useQuery({
    queryKey: ["pincode-lookup", address.pincode],
    queryFn: () => customerAddressApi.lookupPincode(address.pincode),
    enabled: pinOk,
    staleTime: Infinity,
    retry: false,
  })

  function markDetailsChanged() {
    setCheckoutStep((step) => step === "confirmation" ? "address" : step)
  }

  function setField<K extends keyof AddressFields>(key: K, value: string) {
    setAddress((a) => ({ ...a, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
    markDetailsChanged()
  }

  async function detectCurrentLocation() {
    setLocationError(null)
    if (!navigator.geolocation) {
      setLocationError("Your browser doesn't support location access. Please enter your address manually.")
      return
    }

    setDetectingLocation(true)
    try {
      const detected = await detectAddressFromCurrentLocation(
        navigator.geolocation,
        customerAddressApi.reverseGeocode,
      )
      setAddress((current) => mergeDetectedAddress(current, detected))
      setErrors((current) => {
        const next = { ...current }
        for (const field of [
          "address_line1",
          "address_line2",
          "landmark",
          "locality",
          "city",
          "district",
          "state",
          "pincode",
        ] as const) {
          if (detected[field]?.trim()) next[field] = undefined
        }
        return next
      })
      markDetailsChanged()
    } catch (error) {
      setLocationError(
        error instanceof CurrentLocationError
          ? error.message
          : error instanceof ApiError
            ? error.message
            : "We couldn't look up your location. Please try again, or enter your address manually.",
      )
    } finally {
      setDetectingLocation(false)
    }
  }

  function scrollToDeliveryDetails() {
    deliveryDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function scrollToOrderSummary() {
    orderSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const location = pinOk ? pinLookup.data : undefined

  // Once a full PIN is typed, fill an empty State/District from India Post —
  // never overwriting what the customer entered.
  function handlePincode(value: string) {
    const pincode = value.replace(/\D/g, "").slice(0, 6)
    setField("pincode", pincode)
    if (validatePincode(pincode) !== null) return
    queryClient
      .fetchQuery({
        queryKey: ["pincode-lookup", pincode],
        queryFn: () => customerAddressApi.lookupPincode(pincode),
        staleTime: Infinity,
      })
      .then((loc) =>
        setAddress((a) =>
          a.pincode !== pincode
            ? a
            : {
                ...a,
                state: a.state || (INDIAN_STATES.includes(loc.state) ? loc.state : a.state),
                district: a.district || (loc.current_districts.length === 1 ? loc.current_districts[0] : a.district),
              },
        ),
      )
      .catch(() => {
        // Shown by the lookup status under the field; the server re-verifies anyway.
      })
  }

  const estimate = lines.reduce((sum, l) => sum + (l.finalPrice ?? l.price) * l.qty, 0)
  const bulkRecipientCount = lines.reduce((sum, line) => sum + line.qty, 0)

  useEffect(() => {
    if (!validCardQuantity(bulkRecipientCount)) return
    setBulkRecipients((previous) => resizeRecipients(previous, bulkRecipientCount))
    setRecipientErrors((previous) => Array.from({ length: bulkRecipientCount }, (_, index) => previous[index] ?? {}))
    if (savedRecipients.length !== bulkRecipientCount) setSavedRecipients(resizeRecipients(savedRecipients, bulkRecipientCount))
  }, [bulkRecipientCount, savedRecipients, setSavedRecipients])

  function updateBulkRecipient(index: number, field: keyof CheckoutRecipient, value: string) {
    const next = [...bulkRecipients]
    next[index] = { ...next[index], [field]: value }
    setBulkRecipients(next)
    setSavedRecipients(next)
    setRecipientErrors((previous) => previous.map((entry, slot) => slot === index ? { ...entry, [field]: undefined } : entry))
    markDetailsChanged()
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

  function validate(): Errors {
    const found: Errors = {}
    const set = (key: keyof Errors, message: string | null) => {
      if (message) found[key] = message
    }
    set("full_name", validateName(fullName))
    set("phone", validatePhone(phone))
    set("delivery_phone", validatePhone(deliveryPhone))
    set("address_line1", validateAddressLine1(address.address_line1))
    set("city", validateCity(address.city))
    set("district", validateDistrict(address.district))
    set("state", validateState(address.state))
    set("pincode", validatePincode(address.pincode))
    return found
  }

  async function handlePay(e?: FormEvent) {
    e?.preventDefault()
    setPayError(null)
    const validatedRecipients = validateBulkRecipients()
    if (validatedRecipients === null) {
      recipientDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }
    if (checkoutStep === "summary") {
      setCheckoutStep("address")
      scrollToDeliveryDetails()
      return
    }
    if (checkoutStep === "address") {
      if (!isFresh(contact)) {
        clearVerification()
        navigate("/checkout/verify?redirect=%2Fcheckout", { replace: true })
        return
      }
      if (!emailReady || !verifiedEmail) {
        setPayError("Please verify your email address — your order confirmation is sent there.")
        purchaserDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        return
      }
      if (lines.length === 0) {
        toast.error("Your cart is empty.")
        return
      }

      const found = validate()
      setErrors(found)
      if (Object.keys(found).length > 0) {
        toast.error("Please fix the highlighted fields.")
        scrollToDeliveryDetails()
        return
      }
      setCheckoutStep("confirmation")
      scrollToOrderSummary()
      return
    }

    if (!isFresh(contact)) {
      clearVerification()
      navigate("/checkout/verify?redirect=%2Fcheckout", { replace: true })
      return
    }
    if (!emailReady || !verifiedEmail) {
      setPayError("Please verify your email address — your order confirmation is sent there.")
      return
    }
    if (lines.length === 0) {
      toast.error("Your cart is empty.")
      return
    }
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) {
      toast.error("Please fix the highlighted fields.")
      return
    }

    const payload: GuestCheckoutInput = {
      contact: {
        full_name: fullName.trim(),
        email: verifiedEmail.destination,
        phone: phone.replace(/\D/g, "").slice(-10),
      },
      address: { ...address, phone: deliveryPhone.trim(), country: "India" },
      items: lines.map((l) => ({ product_id: l.productId, qty: l.qty })),
      ...(validatedRecipients.length > 0 ? { recipients: validatedRecipients } : {}),
      email_verification_token: verifiedEmail.token,
      ...(viaMobile && contact ? { phone_verification_token: contact.token } : {}),
      session_ref: sessionRef,
    }

    const useDummy = !config.data?.enabled && Boolean(config.data?.dummy_enabled)
    let checkoutId: string | null = null
    if (useDummy) {
      const key = JSON.stringify(payload)
      if (dummy && dummy.key === key) {
        setDummyError(null)
        setDummyOpen(true)
        return
      }
    }

    setPaying(true)
    try {
      if (useDummy) {
        const checkout = await paymentsApi.createGuestCheckout({ ...payload, provider: "dummy" })
        setDummy({ checkout, key: JSON.stringify(payload) })
        setDummyError(null)
        setDummyOpen(true)
        return
      }
      const checkout = await paymentsApi.createGuestCheckout(payload)
      checkoutId = checkout.checkout_id
      const paid = await payWithRazorpay(checkout, settings.site_name)
      finishOrder(await paymentsApi.verifyPayment(paid))
    } catch (err) {
      if (err instanceof PaymentCancelled || err instanceof PaymentFailed) {
        try {
          if (checkoutId) await paymentsApi.cancelCheckout(checkoutId)
          setPayError(err instanceof PaymentCancelled
            ? "Payment was cancelled. You can try again whenever you're ready."
            : err.message)
        } catch {
          setPayError("The payment window closed, but we couldn't release this checkout. Please try again.")
        }
      } else if (err instanceof ApiError) {
        const contactErrors = (err.errors?.contact ?? {}) as Record<string, unknown>
        const addressErrors = (err.errors?.address ?? {}) as Record<string, unknown>
        const fieldErrors: Errors = {}
        for (const key of ["full_name", "phone", "email"] as const) {
          const msg = firstError(contactErrors[key]) ?? firstError(err.errors?.[key])
          if (msg) fieldErrors[key] = msg
        }
        for (const key of Object.keys(EMPTY_ADDRESS) as (keyof AddressFields)[]) {
          const msg = firstError(addressErrors[key]) ?? firstError(err.errors?.[key])
          if (msg) fieldErrors[key] = msg
        }
        setErrors(fieldErrors)
        if (err.errors?.recipients) {
          setCheckoutStep("summary")
          recipientEmailAvailability.retry()
          recipientDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        if (firstError(err.errors?.code) === "verification_required") {
          // Expired or not bound to this checkout — verify again.
          clearVerification()
          navigate("/checkout/verify?redirect=%2Fcheckout", { replace: true })
          return
        }
        setPayError(err.message)
      } else {
        setPayError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      }
    } finally {
      setPaying(false)
    }
  }

  function finishOrder(result: VerifiedPayment) {
    clearCart()
    // The verified contact is NOT cleared here: React Router runs this
    // navigation as a transition, and clearing it first re-rendered this
    // still-mounted page into its "no verified contact" redirect, which sent
    // the buyer back to /checkout/verify instead of the success page.
    // OrderSuccess clears it once it has taken over.
    const successState = {
      orderId: String(result.order_id),
      orderNumber: result.order_number,
      trackingToken: result.tracking_token,
      customerName: fullName.trim(),
      accountCreated: result.account_created,
      purchaserSetup: result.purchaser_setup,
      email: result.email,
      testPayment: result.payment_method === "DUMMY",
    }
    storeOrderSuccess(successState)
    navigate("/order-success", {
      replace: true,
      state: successState,
    })
  }

  async function confirmDummyPayment() {
    if (!dummy || confirming) return
    setConfirming(true)
    setDummyError(null)
    try {
      // Idempotent on the backend: a repeated click returns the same order.
      finishOrder(await paymentsApi.confirmDummyPayment(dummy.checkout.checkout_id, dummy.checkout.amount))
    } catch (err) {
      if (err instanceof ApiError && err.errors.recipients) {
        setDummy(null)
        setDummyOpen(false)
        setCheckoutStep("summary")
        recipientEmailAvailability.retry()
        recipientDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        setPayError(err.message)
      } else if (err instanceof ApiError && firstError(err.errors?.code) === "amount_mismatch") {
        // Prices changed since this checkout was priced — start a fresh one.
        setDummy(null)
        setDummyOpen(false)
        setPayError(err.message)
      } else {
        setDummyError(err instanceof Error ? err.message : "Couldn't confirm the payment. Please try again.")
      }
    } finally {
      setConfirming(false)
    }
  }

  // OTP verification is mandatory for guests — no verified contact, no checkout.
  if (!isFresh(contact)) return <Navigate to="/checkout/verify?redirect=%2Fcheckout" replace />

  if (config.isLoading) {
    return (
      <div className="grid gap-8 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    )
  }

  // Razorpay when configured; otherwise the temporary test payment where the
  // backend allows it (never on the live site by default).
  const paymentsEnabled = Boolean(config.data?.enabled || config.data?.dummy_enabled)
  const testPayments = !config.data?.enabled && Boolean(config.data?.dummy_enabled)
  const deliveryLines = [
    [address.address_line1, address.address_line2].filter(Boolean).join(", "),
    [address.landmark, address.locality].filter(Boolean).join(", "),
    [address.city, address.district && `Dist. ${address.district}`].filter(Boolean).join(", "),
    `${address.state} - ${address.pincode}`,
  ].filter((line) => line.trim())

  return (
    <form onSubmit={handlePay} noValidate className="grid gap-8 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Verified contact (+ the email, when verified by mobile) */}
        <section ref={purchaserDetailsRef} className="rounded-2xl border bg-card p-6 shadow-sm" aria-labelledby="contact-heading">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 id="contact-heading" className="text-lg font-semibold text-foreground">
              Your contact
            </h2>
            <Link to="/login?redirect=%2Fcheckout" className="text-sm font-medium text-primary hover:underline">
              Have an account? Log in
            </Link>
          </div>
          <div className="mt-4 space-y-4">
            <OtpVerifier
              channel={contact.channel}
              label={viaMobile ? "Mobile Number" : "Email Address"}
              placeholder=""
              value={contact.destination}
              onChange={() => {}}
              sessionRef={sessionRef}
              verified
              onVerified={() => {}}
              onChangeVerified={() => {
                clearVerification()
                navigate("/checkout/verify?redirect=%2Fcheckout")
              }}
            />
            {viaMobile && (
              <div className="space-y-1.5">
                <OtpVerifier
                  channel="EMAIL"
                  label="Email Address"
                  placeholder="you@example.com"
                  value={emailReady && verifiedEmail ? verifiedEmail.destination : emailInput}
                  onChange={(value) => { setEmailInput(value); markDetailsChanged() }}
                  sessionRef={sessionRef}
                  verified={emailReady}
                  onVerified={(token, destination) => {
                    setVerifiedEmail({ channel: "EMAIL", destination, token, verifiedAt: Date.now() })
                    markDetailsChanged()
                  }}
                  onChangeVerified={() => { setVerifiedEmail(null); markDetailsChanged() }}
                />
                {!emailReady && (
                  <p className="text-xs text-muted-foreground">
                    Required: your purchaser order confirmation is sent to this email.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

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

        {/* 2. Delivery details */}
        <section ref={deliveryDetailsRef} className="rounded-2xl border bg-card p-6 shadow-sm" aria-labelledby="details-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="details-heading" className="text-lg font-semibold text-foreground">
              Purchaser and delivery details
            </h2>
            <Button type="button" variant="outline" onClick={detectCurrentLocation} disabled={detectingLocation}>
              {detectingLocation
                ? <Loader2 className="animate-spin" aria-hidden="true" />
                : <LocateFixed aria-hidden="true" />}
              {detectingLocation ? "Detecting Location…" : "Use Current Location"}
            </Button>
          </div>
          {locationError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {locationError}
            </p>
          )}
          <fieldset disabled={paying} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field id="g-name" label="Purchaser Full Name" error={errors.full_name}>
              <Input id="g-name" autoComplete="name" value={fullName} onChange={(e) => { setFullName(e.target.value); setErrors((x) => ({ ...x, full_name: undefined })); markDetailsChanged() }} aria-invalid={!!errors.full_name} />
            </Field>
            <Field id="g-phone" label="Purchaser Mobile Number" error={errors.phone}>
              <Input
                id="g-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="9876543210"
                value={phone}
                readOnly={viaMobile}
                onChange={(e) => { setPhone(e.target.value); setErrors((x) => ({ ...x, phone: undefined })); markDetailsChanged() }}
                aria-invalid={!!errors.phone}
              />
            </Field>
            <Field id="g-delivery-phone" label="Delivery Phone Number" error={errors.delivery_phone}>
              <Input id="g-delivery-phone" type="tel" required autoComplete="shipping tel" value={deliveryPhone}
                onChange={(event) => { setDeliveryPhone(event.target.value); setErrors((previous) => ({ ...previous, delivery_phone: undefined })); markDetailsChanged() }}
                aria-invalid={Boolean(errors.delivery_phone)} />
            </Field>
            <Field id="g-line1" label="Address Line 1" error={errors.address_line1} className="sm:col-span-2">
              <Input id="g-line1" autoComplete="address-line1" placeholder="Flat / House No., Building, Street" value={address.address_line1} onChange={(e) => setField("address_line1", e.target.value)} aria-invalid={!!errors.address_line1} />
            </Field>
            <Field id="g-line2" label="Address Line 2" optional className="sm:col-span-2">
              <Input id="g-line2" autoComplete="address-line2" value={address.address_line2} onChange={(e) => setField("address_line2", e.target.value)} />
            </Field>
            <Field id="g-landmark" label="Landmark" optional>
              <Input id="g-landmark" value={address.landmark} onChange={(e) => setField("landmark", e.target.value)} />
            </Field>
            <Field id="g-locality" label="Village / Locality" optional error={errors.locality}>
              <Input id="g-locality" list="g-pin-offices" value={address.locality} onChange={(e) => setField("locality", e.target.value)} aria-invalid={!!errors.locality} />
            </Field>
            <Field id="g-city" label="City" error={errors.city}>
              <Input id="g-city" autoComplete="address-level2" value={address.city} onChange={(e) => setField("city", e.target.value)} aria-invalid={!!errors.city} />
            </Field>
            <Field id="g-district" label="District" error={errors.district}>
              <Input id="g-district" list="g-pin-districts" value={address.district} onChange={(e) => setField("district", e.target.value)} aria-invalid={!!errors.district} />
            </Field>
            <Field id="g-state" label="State" error={errors.state}>
              <Select value={address.state} onValueChange={(v) => setField("state", v)}>
                <SelectTrigger id="g-state" className="w-full" aria-invalid={!!errors.state}>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="g-pincode" label="PIN Code" error={errors.pincode}>
              <Input
                id="g-pincode"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="500001"
                value={address.pincode}
                onChange={(e) => handlePincode(e.target.value)}
                aria-invalid={!!errors.pincode}
              />
              {pinOk && pinLookup.isFetching && <p className="text-xs text-muted-foreground">Checking PIN code…</p>}
              {location && !errors.pincode && (
                <p className="text-xs text-success">{location.state} · {location.post_offices.slice(0, 3).join(", ")}</p>
              )}
              {pinOk && pinLookup.isError && !errors.pincode && (
                <p className="text-xs text-destructive">
                  {pinLookup.error instanceof ApiError ? pinLookup.error.message : "We couldn't check this PIN code right now."}
                </p>
              )}
            </Field>
            <datalist id="g-pin-offices">{location?.post_offices.map((n) => <option key={n} value={n} />)}</datalist>
            <datalist id="g-pin-districts">
              {location && [...new Set([...location.current_districts, ...location.districts])].map((n) => <option key={n} value={n} />)}
            </datalist>
          </fieldset>
        </section>
      </div>

      {/* Summary + pay */}
      <div ref={orderSummaryRef} className="h-fit rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Order Summary</h2>
          {bulkRecipientCount > 0 && !validCardQuantity(bulkRecipientCount) && <p role="alert" className="mt-3 text-sm text-destructive">Orders support 1 to 10 cards. Update your cart quantity before checkout.</p>}
        {lines.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Your cart is empty. <Link to="/shop" className="font-medium text-primary hover:underline">Choose a card</Link>
          </p>
        ) : (
          <div className="mt-4 space-y-2 border-b pb-4 text-sm">
            {lines.map((l) => (
              <div key={l.lineId} className="flex justify-between gap-3 text-muted-foreground">
                <span>
                  {l.name} × {l.qty}
                </span>
                <span className="text-foreground">{formatCurrency((l.finalPrice ?? l.price) * l.qty, settings.currency)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-between text-sm text-muted-foreground">
          <span>Estimated total</span>
          <span className="font-semibold text-foreground">{formatCurrency(estimate, settings.currency)}</span>
        </div>
        {checkoutStep === "confirmation" && (
          <section aria-label="Order Confirmation and Payment Details" className="mt-5 space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
            <h3 className="font-semibold text-foreground">Order Confirmation / Payment Details</h3>
            <div>
              <p className="font-medium text-foreground">Purchaser</p>
              <p>{fullName.trim()} · {verifiedEmail?.destination} · {phone}</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Delivery</p>
              <p>{deliveryPhone}</p>
              {deliveryLines.map((line, index) => <p key={index}>{line}</p>)}
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
        <p className="mt-2 text-xs text-muted-foreground">
          The final amount — including any offers and the first-order discount — is calculated securely and shown in
          the payment window before you pay.
        </p>

        <DesignerContactNotice className="mt-6" />

        {!paymentsEnabled && (
          <div role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>Online payment isn&apos;t configured yet, so orders can&apos;t be paid right now. Please try again later or contact us.</span>
          </div>
        )}
        {testPayments && (
          <p className="mt-4 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
            Online payment isn&apos;t live yet — Pay Now completes a <strong>test payment</strong> (no money is charged).
          </p>
        )}
        {payError && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {payError}
          </p>
        )}
        <Button
          type="button"
          size="lg"
          className="mt-4 w-full"
          onClick={() => void handlePay()}
          disabled={paying || confirming || !validCardQuantity(bulkRecipientCount) || !recipientEmailAvailability.allAvailable}
        >
          Pay Now
        </Button>
        {paymentsEnabled && !emailReady && (
          <p className="mt-2 text-center text-xs text-muted-foreground">Verify your email address to continue.</p>
        )}
      </div>

      <DummyPaymentDialog
        checkout={dummyOpen && dummy ? dummy.checkout : null}
        email={verifiedEmail?.destination ?? ""}
        delivery={{ fullName: fullName.trim(), phone: deliveryPhone.trim(), lines: deliveryLines }}
        currency={settings.currency}
        confirming={confirming}
        error={dummyError}
        onConfirm={confirmDummyPayment}
        onCancel={() => setDummyOpen(false)}
      />
    </form>
  )
}
