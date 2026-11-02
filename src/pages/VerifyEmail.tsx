import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { CircleCheck, CircleX, Clock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthStatusCard } from "@/components/auth/AuthStatusCard"
import { ResendVerificationButton } from "@/components/auth/ResendVerificationButton"
import { ApiError, authApi } from "@/lib/api"

type Status = "verifying" | "verified" | "already" | "expired" | "invalid" | "error"

/**
 * Landing page for the emailed verification link (/verify-email?token=...).
 * The token is read once and immediately removed from the address bar, then
 * checked by the backend (accounts/views.py's VerifyEmailView), which alone
 * decides whether it's valid, expired, already used or replaced.
 */
export default function VerifyEmail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [token] = useState(() => searchParams.get("token") ?? "")
  const [status, setStatus] = useState<Status>(token ? "verifying" : "invalid")
  const [message, setMessage] = useState("")
  const [verifiedEmail, setVerifiedEmail] = useState("")
  const [resendEmail, setResendEmail] = useState("")
  const started = useRef(false)

  useEffect(() => {
    // Keep the single-use token out of browser history and shared URLs.
    if (searchParams.has("token")) navigate("/verify-email", { replace: true })
  }, [searchParams, navigate])

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    authApi
      .verifyEmail({ token })
      .then((result) => {
        setVerifiedEmail(result.email)
        setStatus(result.already_verified ? "already" : "verified")
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          setMessage(err.message)
          setStatus(err.errors?.code === "token_expired" ? "expired" : "invalid")
        } else {
          setStatus("error")
        }
      })
  }, [token])

  const loginLink = (
    <Button asChild className="w-full" size="lg">
      <Link to="/login">Go to Login</Link>
    </Button>
  )

  if (status === "verifying") {
    return (
      <AuthStatusCard
        icon={<Loader2 className="size-7 animate-spin" />}
        title="Verifying your email"
        description="Just a moment…"
      />
    )
  }

  if (status === "verified" || status === "already") {
    return (
      <AuthStatusCard
        icon={<CircleCheck className="size-7" />}
        tone="success"
        title={status === "verified" ? "Email verified!" : "Already verified"}
        description={
          <>
            {status === "verified" ? "Your email " : "The email "}
            {verifiedEmail && <span className="font-medium text-foreground break-all">{verifiedEmail}</span>}
            {status === "verified"
              ? " is confirmed. You can now log in to your VR's GATEWAY account."
              : " has already been verified. You can log in."}
          </>
        }
      >
        {loginLink}
      </AuthStatusCard>
    )
  }

  if (status === "error") {
    return (
      <AuthStatusCard
        icon={<CircleX className="size-7" />}
        tone="destructive"
        title="Couldn't verify right now"
        description="We couldn't reach the server. Check your connection and open the link from your email again."
      >
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">Back to Login</Link>
        </Button>
      </AuthStatusCard>
    )
  }

  return (
    <AuthStatusCard
      icon={status === "expired" ? <Clock className="size-7" /> : <CircleX className="size-7" />}
      tone="destructive"
      title={status === "expired" ? "Link expired" : "Invalid verification link"}
      description={
        message ||
        "This verification link is invalid or incomplete. Make sure you opened the full link from your latest email."
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="verify-resend-email">Email address</Label>
          <Input
            id="verify-resend-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
          />
        </div>
        <ResendVerificationButton email={resendEmail} variant="default" className="w-full" />
        <Button asChild variant="ghost" className="w-full">
          <Link to="/login">Back to Login</Link>
        </Button>
      </div>
    </AuthStatusCard>
  )
}
