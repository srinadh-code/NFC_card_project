import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiError, authApi } from "@/lib/api"

const RESEND_COOLDOWN_SECONDS = 30

/**
 * "Resend verification email" with a short cooldown, shared by the Sign Up
 * success panel, the Login page (unverified account) and the Verify Email
 * page (expired/invalid link). The backend reply is deliberately generic,
 * so this never claims more than "if needed, a new link was sent".
 */
export function ResendVerificationButton({
  email,
  variant = "outline",
  className,
}: {
  email: string
  variant?: "outline" | "default"
  className?: string
}) {
  const [sending, setSending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_SECONDS)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  async function handleResend() {
    if (!email.trim() || sending || cooldown > 0) return
    setSending(true)
    try {
      await authApi.resendOtp({ email: email.trim(), purpose: "REGISTER" })
      toast.success("If your email still needs verifying, a new link is on its way. Please check your inbox.")
      startCooldown()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't resend the email. Please try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={handleResend}
      disabled={!email.trim() || sending || cooldown > 0}
    >
      {sending ? <Loader2 className="size-4 animate-spin" /> : <MailCheck className="size-4" />}
      {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"}
    </Button>
  )
}
