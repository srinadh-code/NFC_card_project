import { useState } from "react"
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Check, Sparkles, X, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput, PasswordRequirements } from "@/components/ui/password-input"
import { useCustomerAuthStore, useAuthStore } from "@/store/auth-store"
import { ApiError, authApi, fieldErrorMessage, setTokens } from "@/lib/api"
import {
  PASSWORD_MAX_LENGTH,
  PHONE_DIGITS,
  cn,
  isPasswordValid,
  isTenDigitPhone,
  sanitizeRedirect,
} from "@/lib/utils"

const CHECKLIST = [
  "Digital Business Profile",
  "Easy Sharing",
  "Real-time Analytics",
  "Secure & Reliable",
]

export default function CustomerRegister() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const customer = useCustomerAuthStore((s) => s.customer)

  // Mirrors Login.tsx: if we arrived via the "order a card while logged
  // out" redirect, send the new account straight back to finish checkout.
  const redirectTo = sanitizeRedirect(searchParams.get("redirect"), "/dashboard")
  const redirectQuery = searchParams.get("redirect")
    ? `?redirect=${encodeURIComponent(searchParams.get("redirect")!)}`
    : ""

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  })
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Recomputed on every keystroke — these drive the live checklist, the
  // "Passwords match" line and the submit guard from one shared helper.
  const passwordOk = isPasswordValid(form.password)
  const passwordsMatch = form.confirmPassword.length > 0 && form.confirmPassword === form.password

  if (customer) return <Navigate to={redirectTo} replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.password) {
      setFormError("Please fill in all fields to continue.")
      return
    }
    setPhoneError(null)
    // Inline, below the field — not a toast/popup. The backend independently
    // re-validates this (RegisterSerializer.validate_phone) and is the final
    // authority; this only gives faster feedback before the request is sent.
    if (!isTenDigitPhone(form.phone)) {
      setPhoneError(`Phone number must be exactly ${PHONE_DIGITS} digits.`)
      return
    }
    // Blocked before the request is ever made; the backend enforces the same
    // rules again (accounts/validators.py) and is the final authority.
    if (!passwordOk) {
      setFormError("Your password doesn't meet all the requirements shown under the Password field.")
      return
    }
    if (!passwordsMatch) {
      setFormError("Password and confirmation do not match.")
      return
    }
    setFormError(null)
    setSubmitting(true)
    try {
      const payload = await authApi.register({
        full_name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone ? `+91 ${form.phone}` : undefined,
        password: form.password,
      })
      setTokens(payload.access, payload.refresh)
      useAuthStore.getState().setUser(payload.user)
      toast.success(`Welcome to VR's NEXORA, ${form.name.split(" ")[0]}!`)
      navigate(redirectTo)
    } catch (err) {
      // A backend-side phone rejection (its own independent check) is shown
      // under the Phone field, same as the client-side check above — only a
      // non-field failure (duplicate email, network error, etc.) still goes
      // to the generic banner + toast.
      const phoneMessage = err instanceof ApiError ? fieldErrorMessage(err.errors, "phone") : null
      if (phoneMessage) {
        setPhoneError(phoneMessage)
      } else {
        const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again."
        setFormError(message)
        toast.error(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex overflow-y-auto bg-background">
      {/* Left dark gradient panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1a1233] via-[#2c1c5c] to-[#3b2a7a] p-12 text-white md:flex">
        <div className="absolute -right-24 -top-24 size-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-80 rounded-full bg-fuchsia-500/10 blur-3xl" />

        <div className="relative z-10 flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-white/15">
            <Zap className="size-5" fill="currentColor" />
          </div>
          <span className="text-lg font-bold tracking-tight">VR's NEXORA</span>
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold leading-tight">Create Your Account</h1>
          <p className="max-w-sm text-white/70">
            Join thousands of professionals who share their contact details with a single tap.
          </p>

          <ul className="space-y-3">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Check className="size-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="relative mt-6 h-40 w-64">
            <div className="absolute left-0 top-0 flex h-40 w-64 flex-col justify-between rounded-[28px] border border-white/25 bg-white/10 p-4 shadow-2xl backdrop-blur-md">
              <div className="mx-auto h-1.5 w-10 rounded-full bg-white/30" />
              <div className="space-y-2">
                <div className="mx-auto size-12 rounded-full bg-white/20" />
                <div className="mx-auto h-2 w-24 rounded-full bg-white/25" />
                <div className="mx-auto h-2 w-16 rounded-full bg-white/15" />
              </div>
              <div className="mx-auto h-1.5 w-16 rounded-full bg-white/20" />
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-sm text-white/60">
          <Sparkles className="size-4" />
          Set up your card in under 2 minutes
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex w-full flex-1 items-center justify-center overflow-y-auto px-6 py-10 md:w-1/2">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Sign Up</h2>
            <p className="text-sm text-muted-foreground">
              Create your VR's NEXORA account to get started.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="Srinadh R"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Email</Label>
              <Input
                id="reg-email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number</Label>
              <div
                className={cn(
                  "flex items-center rounded-md border shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50",
                  phoneError && "border-destructive focus-within:ring-destructive/20"
                )}
              >
                <span className="border-r px-3 py-2 text-sm text-muted-foreground">+91</span>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="98765 43210"
                  className="border-0 shadow-none focus-visible:ring-0"
                  value={form.phone}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, PHONE_DIGITS) }))
                    setPhoneError(null)
                  }}
                  maxLength={PHONE_DIGITS}
                  aria-invalid={!!phoneError}
                  aria-describedby={phoneError ? "phone-error" : undefined}
                  required
                />
              </div>
              {phoneError && (
                <p id="phone-error" role="alert" className="text-sm text-destructive">
                  {phoneError}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-password">Password</Label>
              <PasswordInput
                id="reg-password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                aria-describedby="reg-password-requirements"
                aria-invalid={form.password.length > 0 && !passwordOk}
                required
              />
              <PasswordRequirements id="reg-password-requirements" password={form.password} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-confirm-password">Confirm Password</Label>
              <PasswordInput
                id="reg-confirm-password"
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                aria-describedby="reg-confirm-password-status"
                aria-invalid={form.confirmPassword.length > 0 && !passwordsMatch}
                required
              />
              {form.confirmPassword.length > 0 && (
                <p
                  id="reg-confirm-password-status"
                  role="status"
                  aria-live="polite"
                  className={cn(
                    "flex items-center gap-1.5 text-xs",
                    passwordsMatch ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                  )}
                >
                  {passwordsMatch ? (
                    <Check className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <X className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  Passwords match
                </p>
              )}
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Signing up..." : "Sign Up"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to={`/login${redirectQuery}`} className="font-medium text-primary hover:underline">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
