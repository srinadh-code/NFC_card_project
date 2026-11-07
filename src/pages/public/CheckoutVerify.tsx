import { useEffect, useState } from "react"
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, CheckCircle2, Mail, ShieldCheck, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BulkRecipientFields, type BulkRecipientErrors } from "@/components/checkout/BulkRecipientFields"
import { useRecipientEmailAvailability } from "@/hooks/useRecipientEmailAvailability"
import { OtpVerifier } from "@/components/checkout/OtpVerifier"
import { useCart } from "@/hooks/useCart"
import { paymentsApi, type VerificationChannel } from "@/lib/api"
import { resizeRecipients, validateRecipients, validCardQuantity, type CheckoutRecipient } from "@/lib/checkout-recipients"
import { cn, sanitizeRedirect } from "@/lib/utils"
import { useCustomerAuthStore } from "@/store/auth-store"
import { isFresh, useCheckoutVerificationStore } from "@/store/checkout-verification-store"

/**
 * "Verify Your Contact" — the mandatory step a guest goes through before
 * checkout, instead of creating an account. One method, email OTP or mobile
 * OTP, verified by the backend; nothing is stored as an account until a
 * payment is verified (payments/services.py). Signed-in customers skip it.
 */
export default function CheckoutVerify() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectTo = sanitizeRedirect(searchParams.get("redirect"), "/checkout")
  const customer = useCustomerAuthStore((s) => s.customer)
  const { lines } = useCart()
  const {
    sessionRef,
    contact,
    setContact,
    bulkRecipientCount: savedRecipientCount,
    recipients,
    setRecipients,
    recipientDetailsConfirmed,
    confirmRecipients,
  } = useCheckoutVerificationStore()
  const config = useQuery({ queryKey: ["payments-config"], queryFn: paymentsApi.config, staleTime: 60_000 })

  const [method, setMethod] = useState<VerificationChannel>("EMAIL")
  const [email, setEmail] = useState("")
  const [mobile, setMobile] = useState("")
  const [recipientErrors, setRecipientErrors] = useState<BulkRecipientErrors>([])
  // Set when this visit's verification succeeded — shows the verified state
  // with "Continue to Checkout" instead of redirecting straight away.
  const [justVerified, setJustVerified] = useState(false)

  const cartQuantity = lines.reduce((quantity, line) => quantity + line.qty, 0)
  const bulkRecipientCount =
    cartQuantity > 0 ? cartQuantity : savedRecipientCount
  const recipientEmailAvailability = useRecipientEmailAvailability(
    recipients,
    contact?.channel === "EMAIL" ? contact.destination : "",
  )

  useEffect(() => {
    if (bulkRecipientCount === null || !validCardQuantity(bulkRecipientCount) || recipients.length === bulkRecipientCount) return
    setRecipients(
      resizeRecipients(recipients, bulkRecipientCount),
    )
  }, [bulkRecipientCount, recipients, setRecipients])

  if (bulkRecipientCount !== null && !validCardQuantity(bulkRecipientCount)) {
    return <div className="mx-auto max-w-xl space-y-4 px-4 py-12"><p role="alert" className="text-destructive">Orders support 1 to 10 cards. Update your cart quantity to continue.</p><Button onClick={() => navigate("/cart")}>Return to Cart</Button></div>
  }

  if (customer || (isFresh(contact) && !justVerified && recipientDetailsConfirmed)) return <Navigate to={redirectTo} replace />

  const smsEnabled = Boolean(config.data?.sms_otp_enabled)

  function updateRecipient(index: number, field: keyof CheckoutRecipient, value: string) {
    const updated = [...recipients]
    updated[index] = { ...(updated[index] ?? { full_name: "", email: "", phone: "" }), [field]: value }
    setRecipients(updated)
    setRecipientErrors((previous) => {
      const next = [...previous]
      next[index] = { ...(next[index] ?? {}), [field]: undefined }
      return next
    })
  }

  function continueToVerification() {
    if (bulkRecipientCount === null) return

    const result = validateRecipients(recipients, bulkRecipientCount)
    setRecipientErrors(result.errors)
    if (!result.valid) {
      toast.error("Please complete each recipient's name, valid email and phone number.")
      return
    }
    setRecipients(result.recipients)
    confirmRecipients()
  }

  function handleVerified(channel: VerificationChannel, token: string, destination: string) {
    setJustVerified(true)
    setContact({ channel, destination, token, verifiedAt: Date.now() })
  }

  if (justVerified && contact) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:py-16">
        <div className="rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8" role="status" aria-live="polite">
          <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
            {contact.channel === "EMAIL" ? "Email verified" : "Mobile number verified"}
          </h1>
          <p className="mt-2 break-all text-sm text-muted-foreground">
            {contact.channel === "EMAIL" ? contact.destination : `+91 ${contact.destination}`}
          </p>
          <Button size="lg" className="mt-6 w-full" onClick={() => navigate(redirectTo, { replace: true })}>
            Continue to Checkout <ArrowRight />
          </Button>
        </div>
      </div>
    )
  }

  if (bulkRecipientCount !== null && !recipientDetailsConfirmed) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-12 sm:py-16">
        <BulkRecipientFields
          count={bulkRecipientCount}
          recipients={recipients}
          errors={recipientErrors}
          emailStatuses={recipientEmailAvailability.statuses}
          onRetryEmailCheck={recipientEmailAvailability.retry}
          onChange={updateRecipient}
        />
        <Button size="lg" className="w-full" onClick={continueToVerification}>
          Continue to Verify Your Contact <ArrowRight />
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:py-16">
      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-xl bg-[#2855C5]/10 text-[#2855C5]">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">Verify Your Contact</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose your preferred method to verify your identity and continue with your order.
        </p>

        <div role="radiogroup" aria-label="Verification method" className="mt-6 grid grid-cols-2 gap-3">
          {(
            [
              { key: "EMAIL", title: "Email OTP", hint: "Code sent to your inbox", icon: Mail, available: true },
              { key: "SMS", title: "Mobile OTP", hint: "Code sent by SMS", icon: Smartphone, available: smsEnabled },
            ] as const
          ).map(({ key, title, hint, icon: Icon, available }) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={method === key}
              disabled={!available}
              onClick={() => setMethod(key)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                method === key ? "border-[#2855C5] bg-[#2855C5]/10 ring-1 ring-[#2855C5]" : "border-border hover:bg-muted/50",
              )}
            >
              <Icon className={cn("size-5", method === key ? "text-[#2855C5]" : "text-muted-foreground")} aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">{title}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
        {config.isLoading ? (
          <Skeleton className="mt-6 h-24 w-full" />
        ) : (
          <>
            {!smsEnabled && (
              <p className="mt-2 text-xs text-muted-foreground">
                Mobile OTP isn&apos;t available — SMS verification hasn&apos;t been set up on this site yet. Please verify
                with your email.
              </p>
            )}
            <div className="mt-6">
              {method === "EMAIL" ? (
                <OtpVerifier
                  key="email"
                  channel="EMAIL"
                  label="Email Address"
                  placeholder="you@example.com"
                  value={email}
                  onChange={setEmail}
                  sessionRef={sessionRef}
                  verified={false}
                  onVerified={(token, destination) => handleVerified("EMAIL", token, destination)}
                />
              ) : (
                <OtpVerifier
                  key="sms"
                  channel="SMS"
                  label="Mobile Number"
                  placeholder="9876543210"
                  value={mobile}
                  onChange={setMobile}
                  sessionRef={sessionRef}
                  verified={false}
                  onVerified={(token, destination) => handleVerified("SMS", token, destination)}
                />
              )}
            </div>
          </>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          No password needed now. Your verified email receives the order confirmation. Card recipients receive
          their own secure account setup instructions as the order is processed. Physical card assignment is handled separately.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm">
          <Link to={`/login?redirect=${encodeURIComponent(redirectTo)}`} className="font-medium text-primary hover:underline">
            Already have an account? Log in
          </Link>
          {lines.length > 0 && (
            <span className="text-muted-foreground">
              {lines.reduce((n, l) => n + l.qty, 0)} item{lines.reduce((n, l) => n + l.qty, 0) === 1 ? "" : "s"} in your cart
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
