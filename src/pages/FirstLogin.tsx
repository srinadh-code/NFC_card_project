import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { PasswordInput, PasswordRequirements } from "@/components/ui/password-input"
import { BrandMark } from "@/components/layout/BrandMark"
import { ApiError, authApi } from "@/lib/api"
import { completeCustomerFirstLogin } from "@/store/auth-store"
import { PASSWORD_MAX_LENGTH, isPasswordValid, passwordRequirementsMessage, sanitizeRedirect } from "@/lib/utils"

interface SetupState {
  setupToken?: string
  email?: string
  redirectTo?: string
}

type FieldErrors = Partial<Record<"temporary" | "next" | "confirm", string>>

function firstError(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined
  return typeof value === "string" ? value : undefined
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandMark
            className="size-11 rounded-xl"
            fallback={
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <ShieldCheck className="size-6" />
              </span>
            }
          />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">{children}</div>
      </div>
    </div>
  )
}

/**
 * Mandatory first-login password setup for accounts created automatically
 * after a paid order (accounts/onboarding.py). Reached only from the login
 * page with the short-lived setup token LoginView issues for a valid
 * temporary password; the backend (FirstLoginCompleteView) re-checks the
 * token, the temporary password and the password policy, and only then
 * issues the normal session — there is no way into the dashboard around it.
 */
export default function FirstLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as SetupState
  const redirectTo = sanitizeRedirect(state.redirectTo ?? null, "/dashboard")

  const [temporary, setTemporary] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  // Success screen, then on to the dashboard.
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => navigate(redirectTo, { replace: true }), 2500)
    return () => clearTimeout(timer)
  }, [done, navigate, redirectTo])

  if (!state.setupToken && !done) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-foreground">Secure Your Account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          To set your password, first log in with the email address and temporary password we sent you.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link to="/login">Go to Login</Link>
        </Button>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell>
        <div className="flex flex-col items-center text-center" role="status" aria-live="polite">
          <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold text-foreground">Password updated</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account is secured. Taking you to your Customer Dashboard…
          </p>
          <Button className="mt-6 w-full" onClick={() => navigate(redirectTo, { replace: true })}>
            Go to Dashboard
          </Button>
        </div>
      </Shell>
    )
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {}
    if (!temporary) found.temporary = "Enter the temporary password from your email."
    if (!next) found.next = "Enter a new password."
    else if (!isPasswordValid(next)) found.next = passwordRequirementsMessage(next)
    else if (next === temporary) found.next = "Choose a password that is different from your temporary password."
    if (!confirm) found.confirm = "Confirm your new password."
    else if (next && confirm !== next) found.confirm = "Passwords do not match."
    return found
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    try {
      const payload = await authApi.completeFirstLogin({
        setup_token: state.setupToken!,
        temporary_password: temporary,
        new_password: next,
        confirm_password: confirm,
      })
      completeCustomerFirstLogin(payload)
      toast.success("Password updated. Welcome to your dashboard!")
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError) {
        const code = firstError(err.errors?.code)
        if (code === "setup_token_invalid" || code === "temporary_password_expired") setSessionExpired(true)
        setErrors({
          temporary: firstError(err.errors?.temporary_password),
          next: firstError(err.errors?.new_password),
          confirm: firstError(err.errors?.confirm_password),
        })
        setFormError(err.message)
      } else {
        setFormError("Something went wrong. Please check your connection and try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Shell>
      <h1 className="text-xl font-bold text-foreground">Secure Your Account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create a new password to access your VRS GATEWAY Customer Dashboard.
      </p>
      {state.email && (
        <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          Signing in as <span className="font-medium text-foreground break-all">{state.email}</span>
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="temporary-password">Temporary Password</Label>
          <PasswordInput
            id="temporary-password"
            autoComplete="current-password"
            value={temporary}
            onChange={(e) => setTemporary(e.target.value)}
            aria-invalid={!!errors.temporary}
            aria-describedby={errors.temporary ? "temporary-password-error" : undefined}
          />
          {errors.temporary && (
            <p id="temporary-password-error" className="text-sm text-destructive">
              {errors.temporary}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-password">New Password</Label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={!!errors.next}
            aria-describedby="new-password-rules"
          />
          {errors.next && <p className="text-sm text-destructive">{errors.next}</p>}
          <PasswordRequirements id="new-password-rules" password={next} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm New Password</Label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={!!errors.confirm}
            aria-describedby={errors.confirm ? "confirm-password-error" : undefined}
          />
          {errors.confirm && (
            <p id="confirm-password-error" className="text-sm text-destructive">
              {errors.confirm}
            </p>
          )}
        </div>

        {formError && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {formError}
            {sessionExpired && (
              <Link to="/login" className="mt-1 block font-medium underline underline-offset-2">
                Back to Login
              </Link>
            )}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="animate-spin" /> Updating…
            </>
          ) : (
            "Update Password"
          )}
        </Button>
      </form>
    </Shell>
  )
}
