import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ApiError, authApi, fieldErrorMessage } from "@/lib/api"
import { PASSWORD_MAX_LENGTH, isPasswordValid, passwordRequirementsMessage } from "@/lib/utils"

const RESEND_COOLDOWN_SECONDS = 30

/** Seconds remaining until `expiresAtIso`, clamped to >= 0 — recomputed
 *  fresh from the backend timestamp on every call, never decremented
 *  locally, so it can't drift from what the server will actually enforce. */
function secondsUntil(expiresAtIso: string): number {
  return Math.max(0, Math.round((new Date(expiresAtIso).getTime() - Date.now()) / 1000))
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

/**
 * Email-OTP-based forgot/reset password flow, shared by the customer login
 * page and the admin login page — password reset isn't role-specific, it
 * works against whichever account owns the email address.
 *
 * Three backend-verified steps: request a code (sent by email to the same
 * address that was just entered — see accounts/emails.py's
 * send_password_reset_otp_email on the backend, via Brevo) -> verify it
 * (the backend alone decides this, returning a short-lived reset_token —
 * there is no local "otpVerified" flag standing in for that) -> spend that
 * token on a new password. Skipping straight to step 3 without a real
 * `reset_token` from step 2 does nothing; the backend rejects it.
 *
 * The "OTP expires in mm:ss" countdown is purely cosmetic — it's derived
 * every second from the `expires_at` timestamp the backend returns (see
 * secondsUntil() above), never from a locally-started 6-minute timer, so a
 * couple of seconds of network latency before this dialog even sees the
 * response is already reflected in the very first tick. The backend alone
 * decides whether an OTP is actually still valid at verify time.
 */
export function ForgotPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [resetToken, setResetToken] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null)
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const otpExpired = otpExpiresAt !== null && remainingSeconds <= 0

  function reset() {
    setStep(1)
    setEmail("")
    setOtp("")
    setResetToken("")
    setNewPassword("")
    setConfirmPassword("")
    setNewPasswordError(null)
    setConfirmPasswordError(null)
    setResendCooldown(0)
    setOtpExpiresAt(null)
    setRemainingSeconds(0)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
  }

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  // Restarts the mm:ss countdown from a fresh backend expires_at — called
  // after both the initial send and every resend, since a resend supersedes
  // whatever expiry was showing before.
  function startOtpCountdown(expiresAtIso: string) {
    setOtpExpiresAt(expiresAtIso)
    setRemainingSeconds(secondsUntil(expiresAtIso))
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      const remaining = secondsUntil(expiresAtIso)
      setRemainingSeconds(remaining)
      if (remaining <= 0 && countdownRef.current) {
        clearInterval(countdownRef.current)
      }
    }, 1000)
  }

  function startResendCooldown() {
    setResendCooldown(RESEND_COOLDOWN_SECONDS)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current)
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    try {
      const { expires_at } = await authApi.forgotPassword({ email: email.trim() })
      toast.success("If an account exists for this email, an OTP has been sent to it.")
      setStep(2)
      startOtpCountdown(expires_at)
      startResendCooldown()
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || submitting) return
    setSubmitting(true)
    try {
      const result = await authApi.resendOtp({ email: email.trim(), purpose: "RESET" })
      toast.success("A new code has been sent.")
      setOtp("")
      if (result?.expires_at) startOtpCountdown(result.expires_at)
      startResendCooldown()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't resend the code. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    if (otp.length !== 6 || otpExpired) return
    setSubmitting(true)
    try {
      const { reset_token } = await authApi.verifyResetOtp({ email: email.trim(), otp })
      setResetToken(reset_token)
      setStep(3)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Invalid or expired code.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!newPassword || !confirmPassword) return

    // Password-field validation is shown inline under the relevant field,
    // not as a toast — the same shared policy Create Account uses (see
    // src/lib/utils.ts), so this can never disagree with what the backend
    // will separately re-check below.
    setNewPasswordError(null)
    setConfirmPasswordError(null)
    if (!isPasswordValid(newPassword)) {
      setNewPasswordError(passwordRequirementsMessage(newPassword))
      return
    }
    if (newPassword !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match.")
      return
    }

    setSubmitting(true)
    try {
      await authApi.resetPassword({
        reset_token: resetToken,
        new_password: newPassword,
        confirm_password: confirmPassword,
      })
      toast.success("Password reset. You can now log in.")
      onOpenChange(false)
      reset()
    } catch (err) {
      // Backend validation errors are mapped to the field they belong to
      // (e.g. a rule the frontend's copy of the policy didn't catch) and
      // shown inline, same as a client-side failure — only a genuinely
      // unrelated failure (expired reset token, network/server error) still
      // falls back to a toast, since there's no field to attach it to.
      const errors = err instanceof ApiError ? err.errors : undefined
      const newPwMessage = fieldErrorMessage(errors, "new_password")
      const confirmPwMessage = fieldErrorMessage(errors, "confirm_password")
      if (newPwMessage || confirmPwMessage) {
        setNewPasswordError(newPwMessage)
        setConfirmPasswordError(confirmPwMessage)
      } else {
        toast.error(err instanceof ApiError ? err.message : "Couldn't reset your password. Please request a new code.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Forgot Password</DialogTitle>
          <DialogDescription>
            {step === 1 && "Enter your account email and we'll send a reset code to it."}
            {step === 2 && `Enter the 6-digit code sent to ${email}.`}
            {step === 3 && "Choose a new password for your account."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <form onSubmit={handleRequestCode} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Sending..." : "Send Reset Code"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-otp">6-digit code</Label>
              <Input
                id="forgot-otp"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </div>

            <p
              className={
                otpExpired ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"
              }
              role="status"
            >
              {otpExpired ? "This code has expired. Request a new one." : `OTP expires in: ${formatCountdown(remainingSeconds)}`}
            </p>

            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || submitting}
              className="text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            >
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
            </button>
            <DialogFooter>
              <Button type="submit" disabled={submitting || otp.length !== 6 || otpExpired}>
                {submitting ? "Verifying..." : "Verify Code"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-new-password">New password</Label>
              <PasswordInput
                id="forgot-new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setNewPasswordError(null)
                }}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                aria-invalid={!!newPasswordError}
                aria-describedby={newPasswordError ? "forgot-new-password-error" : undefined}
                required
              />
              {newPasswordError && (
                <p id="forgot-new-password-error" role="alert" className="text-sm text-destructive">
                  {newPasswordError}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="forgot-confirm-password">Confirm new password</Label>
              <PasswordInput
                id="forgot-confirm-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setConfirmPasswordError(null)
                }}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                aria-invalid={!!confirmPasswordError}
                aria-describedby={confirmPasswordError ? "forgot-confirm-password-error" : undefined}
                required
              />
              {confirmPasswordError && (
                <p id="forgot-confirm-password-error" role="alert" className="text-sm text-destructive">
                  {confirmPasswordError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Resetting..." : "Reset Password"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
