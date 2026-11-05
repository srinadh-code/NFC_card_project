import { useEffect, useState } from "react"
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, CheckCircle2, Mail, ShieldCheck, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BulkRecipientFields, type BulkRecipientErrors } from "@/components/checkout/BulkRecipientFields"
import { OtpVerifier } from "@/components/checkout/OtpVerifier"
import { useCart } from "@/hooks/useCart"
import { paymentsApi, type VerificationChannel } from "@/lib/api"
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
    savedRecipientCount ?? (cartQuantity === 3 || cartQuantity === 5 ? cartQuantity : null)

  useEffect(() => {
    if (bulkRecipientCount === null || recipients.length === bulkRecipientCount) return
    setRecipients(
      Array.from({ length: bulkRecipientCount }, (_, index) => recipients[index] ?? { full_name: "", email: "" }),
    )
  }, [bulkRecipientCount, recipients, setRecipients])

  if (customer || (isFresh(contact) && !justVerified)) return <Navigate to={redirectTo} replace />

  const smsEnabled = Boolean(config.data?.sms_otp_enabled)

  function updateRecipient(index: number, field: "full_name" | "email", value: string) {
    const updated = [...recipients]
    updated[index] = { ...(updated[index] ?? { full_name: "", email: "" }), [field]: value }
    setRecipients(updated)
    setRecipientErrors((previous) => {
      const next = [...previous]
      next[index] = { ...(next[index] ?? {}), [field]: undefined }
      return next
    })
  }

  function continueToVerification() {
    if (bulkRecipientCount === null) return

    const errors: BulkRecipientErrors = Array.from({ length: bulkRecipientCount }, () => ({}))
    const seen = new Set<string>()
    const cleaned = recipients.map((recipient, index) => {
      const full_name = recipient.full_name.trim()
      const email = recipient.email.trim().toLowerCase()
      if (!full_name) errors[index].full_name = "Full Name is required."
      if (!email) errors[index].email = "Email Address is required."
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors[index].email = "Enter a valid email address."
      else if (seen.has(email)) errors[index].email = "Duplicate email addresses are not allowed."
      else seen.add(email)
      return { full_name, email }
    })

    setRecipientErrors(errors)
    if (errors.some((entry) => entry.full_name || entry.email)) {
      toast.error("Please complete every recipient field with a unique, valid email address.")
      return
    }

    setRecipients(cleaned)
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
          No password needed now — after your payment we create your Customer Dashboard account and email you the login
          details.
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
