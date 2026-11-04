import { useEffect, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError, paymentsApi, type VerificationChannel } from "@/lib/api"

// Deliveries and SMS OTPs are India-only today (payments/sms.py sends to
// +91), so India is the one country code offered.
const COUNTRY_CODES = [{ code: "+91", label: "India (+91)" }]
// Matches payments/verification.py CODE_LIFETIME.
const CODE_LIFETIME_SECONDS = 5 * 60

function mmss(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

/**
 * One OTP verification (email or mobile): enter the address/number, receive
 * a 6-digit code, enter it. The backend checks the code — bound to this
 * browser checkout via `sessionRef` — and returns the verification token
 * checkout requires; this component never decides on its own that
 * something is verified.
 */
export function OtpVerifier({
  channel,
  label,
  placeholder,
  value,
  onChange,
  sessionRef,
  verified,
  onVerified,
  onChangeVerified,
  disabled = false,
}: {
  channel: VerificationChannel
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  sessionRef: string
  /** Already verified — shows the verified state instead of the form. */
  verified: boolean
  onVerified: (token: string, destination: string) => void
  /** "Change" on a verified value. */
  onChangeVerified?: () => void
  disabled?: boolean
}) {
  const [code, setCode] = useState("")
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  // Seconds left before the sent code expires (shown under the code box).
  const [expiresIn, setExpiresIn] = useState(0)
  const [busy, setBusy] = useState<"send" | "verify" | null>(null)
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null)
  const id = `otp-${channel.toLowerCase()}`
  const isSms = channel === "SMS"
  const destination = isSms ? value.replace(/\D/g, "") : value.trim()

  useEffect(() => {
    if (cooldown <= 0 && expiresIn <= 0) return
    const timer = setTimeout(() => {
      setCooldown((c) => Math.max(0, c - 1))
      setExpiresIn((e) => Math.max(0, e - 1))
    }, 1000)
    return () => clearTimeout(timer)
  }, [cooldown, expiresIn])

  function validDestination(): string | null {
    if (isSms) return /^[6-9]\d{9}$/.test(destination) ? null : "Enter a valid 10-digit mobile number."
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destination) ? null : "Enter a valid email address."
  }

  async function send() {
    const invalid = validDestination()
    if (invalid) {
      setMessage({ tone: "error", text: invalid })
      return
    }
    setBusy("send")
    setMessage(null)
    try {
      const result = await paymentsApi.sendOtp(channel, destination, sessionRef)
      // Only now — the backend confirmed the code was sent — does the
      // code box appear.
      setSent(true)
      setCode("")
      setCooldown(result.resend_after)
      setExpiresIn(CODE_LIFETIME_SECONDS)
      setMessage({
        tone: "info",
        text: isSms
          ? "We've sent a 6-digit code by SMS. It expires in 5 minutes."
          : "We've emailed you a 6-digit code. It expires in 5 minutes.",
      })
    } catch (err) {
      if (err instanceof ApiError && typeof err.errors?.retry_after === "number") setCooldown(err.errors.retry_after)
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "We couldn't send the code. Please try again." })
    } finally {
      setBusy(null)
    }
  }

  async function verify() {
    if (!/^\d{6}$/.test(code)) {
      setMessage({ tone: "error", text: "Enter the 6-digit code." })
      return
    }
    setBusy("verify")
    setMessage(null)
    try {
      const result = await paymentsApi.verifyOtp(channel, destination, code, sessionRef)
      onVerified(result.verification_token, destination)
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "We couldn't check the code. Please try again." })
    } finally {
      setBusy(null)
    }
  }

  if (verified) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-success/40 bg-success/5 px-3 py-2.5 text-sm">
          <span className="flex min-w-0 items-center gap-2 text-foreground">
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
            <span className="truncate">{isSms ? `+91 ${value}` : value}</span>
            <span className="text-xs font-medium text-success">Verified</span>
          </span>
          {onChangeVerified && (
            <button type="button" className="shrink-0 text-xs font-medium text-primary hover:underline" onClick={onChangeVerified}>
              Change
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 gap-2">
          {isSms && (
            <select
              aria-label="Country code"
              className="h-10 shrink-0 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              defaultValue="+91"
              title="Delivery is available within India"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
          <Input
            id={id}
            type={isSms ? "tel" : "email"}
            inputMode={isSms ? "numeric" : "email"}
            autoComplete={isSms ? "tel-national" : "email"}
            placeholder={placeholder}
            value={value}
            maxLength={isSms ? 10 : undefined}
            disabled={disabled || busy !== null}
            onChange={(e) => {
              onChange(isSms ? e.target.value.replace(/\D/g, "").slice(0, 10) : e.target.value)
              setSent(false)
              setMessage(null)
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={disabled || busy !== null || !destination || cooldown > 0}
          onClick={send}
        >
          {busy === "send" ? <Loader2 className="animate-spin" /> : null}
          {cooldown > 0 ? `Resend in ${cooldown}s` : sent ? "Resend OTP" : "Send OTP"}
        </Button>
      </div>
      {sent && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label={`${label} verification code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="Enter 6-digit OTP"
            className="tracking-[0.3em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                verify()
              }
            }}
          />
          <Button
            type="button"
            className="shrink-0"
            disabled={busy !== null || code.length !== 6 || expiresIn === 0}
            onClick={verify}
          >
            {busy === "verify" ? <Loader2 className="animate-spin" /> : null}
            Verify OTP
          </Button>
        </div>
      )}
      {sent && (
        <p className="text-xs text-muted-foreground" aria-live="off">
          {expiresIn > 0 ? `Code expires in ${mmss(expiresIn)}` : "This code has expired — please resend a new one."}
        </p>
      )}
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
