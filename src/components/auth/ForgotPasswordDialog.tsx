import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ApiError, authApi } from "@/lib/api"

/**
 * OTP-based forgot/reset password flow, shared by the customer login page
 * and the admin login page — password reset isn't role-specific, it works
 * against whichever account owns the email address.
 */
export function ForgotPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setStep(1)
    setEmail("")
    setOtp("")
    setNewPassword("")
  }

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    try {
      await authApi.forgotPassword({ email: email.trim() })
      toast.success("If that account exists, a reset code has been sent to it.")
      setStep(2)
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (otp.length !== 6 || !newPassword) return
    setSubmitting(true)
    try {
      await authApi.resetPassword({ email: email.trim(), otp, new_password: newPassword })
      toast.success("Password reset. You can now log in.")
      onOpenChange(false)
      reset()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Invalid or expired code.")
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
            {step === 1
              ? "Enter your account email and we'll send you a reset code."
              : `Enter the 6-digit code sent to ${email} and choose a new password.`}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
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
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
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
            <div className="space-y-1.5">
              <Label htmlFor="forgot-new-password">New password</Label>
              <Input
                id="forgot-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
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
