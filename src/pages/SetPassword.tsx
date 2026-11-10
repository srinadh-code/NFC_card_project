import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { PasswordInput, PasswordRequirements } from "@/components/ui/password-input"
import { BrandMark } from "@/components/layout/BrandMark"
import { PurchaserSetupRequestForm } from "@/components/auth/PurchaserSetupRequestForm"
import { ApiError, authApi, type AccountSetupPurpose } from "@/lib/api"
import { PASSWORD_MAX_LENGTH, isPasswordValid, passwordRequirementsMessage } from "@/lib/utils"

type FieldErrors = Partial<Record<"next" | "confirm", string>>

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
 * Account activation for customers whose account was created from a paid
 * order: the emailed /set-password?token=... link (single use, expiring —
 * accounts/views.py AccountActivationCheckView/CompleteView). The customer
 * creates their own password here, then logs in normally.
 */
export default function SetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get("token") ?? ""
  // This selects the expected token purpose; the server checks it against
  // the stored token and account before permitting password setup.
  const purpose: AccountSetupPurpose = params.get("purpose") === "purchaser" ? "purchaser" : "recipient"
  const isPurchaser = purpose === "purchaser"

  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ username: string; email: string } | null>(null)

  const check = useQuery({
    queryKey: ["activation-check", purpose, token],
    queryFn: () => authApi.checkActivation(token, purpose),
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  })

  if (isPurchaser && !token) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-foreground">Set Up Your Purchaser Account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Already paid for an order but haven&apos;t set a password? Enter the email you used at checkout to request a secure setup link and access My Orders.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          If you are also a card recipient, use your account-ready email when your order is processed.
        </p>
        <PurchaserSetupRequestForm />
        <Link to="/login?redirect=%2Forders" className="mt-4 block text-center text-sm font-medium text-primary hover:underline">Back to Login</Link>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell>
        <div className="flex flex-col items-center text-center" role="status" aria-live="polite">
          <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold text-foreground">{isPurchaser ? "Your account is ready" : "Your account is active"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isPurchaser ? <>Log in with <span className="font-semibold text-foreground">{done.email}</span> and your new password to view My Orders.</> : <>
              Log in with your username <span className="font-semibold text-foreground">{done.username}</span> or your
              email address and the password you just created.
            </>}
          </p>
          <Button className="mt-6 w-full" onClick={() => navigate(isPurchaser ? "/login?redirect=%2Forders" : "/login", { replace: true, state: { email: isPurchaser ? done.email : done.username } })}>
            Go to Login
          </Button>
        </div>
      </Shell>
    )
  }

  if (!token || check.isError) {
    const message = check.error instanceof ApiError ? check.error.message : "This account setup link is invalid."
    return (
      <Shell>
        <div className="flex flex-col items-center text-center">
          <XCircle className="size-12 text-destructive" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold text-foreground">Link not valid</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          <Button asChild className="mt-6 w-full">
            <Link to="/login">Go to Login</Link>
          </Button>
          <Link to={isPurchaser ? "/set-password?purpose=purchaser" : "/contact"} className="mt-3 text-sm font-medium text-primary hover:underline">
            {isPurchaser ? "Request a new purchaser setup link" : "Need a new link? Contact us"}
          </Link>
        </div>
      </Shell>
    )
  }

  if (check.isLoading) {
    return (
      <Shell>
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-6 h-40 w-full" />
      </Shell>
    )
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {}
    if (!next) found.next = "Enter a password."
    else if (!isPasswordValid(next)) found.next = passwordRequirementsMessage(next)
    if (!confirm) found.confirm = "Confirm your password."
    else if (next && confirm !== next) found.confirm = "Passwords do not match."
    return found
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setFormError(null)
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    try {
      const result = await authApi.completeActivation({ token, new_password: next, confirm_password: confirm, purpose })
      toast.success(isPurchaser ? "Password created. You can now log in to My Orders." : "Password created. Your account is active.")
      setDone(result)
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors({ next: firstError(err.errors?.new_password), confirm: firstError(err.errors?.confirm_password) })
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
      <h1 className="text-xl font-bold text-foreground">{isPurchaser ? "Set Up Your Account" : "Set Your Password"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {isPurchaser ? "Create a password to sign in and view your purchases in My Orders." : "Create a password to activate your VR's Gateway customer account."}
      </p>
      {check.data && (
        <div className="mt-4 space-y-1 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {!isPurchaser && <p>
            Username: <span className="font-medium text-foreground">{check.data.username}</span>
          </p>}
          <p className="break-all">
            Email: <span className="font-medium text-foreground">{check.data.email}</span>
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
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
          <Label htmlFor="confirm-password">Confirm Password</Label>
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
          </div>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="animate-spin" /> {isPurchaser ? "Creating Password..." : "Activating…"}
            </>
          ) : (
            isPurchaser ? "Create Password" : "Set Password & Activate"
          )}
        </Button>
      </form>
    </Shell>
  )
}
