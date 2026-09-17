import { useState } from "react"
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google"
import { Fingerprint, Sparkles, Zap } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog"
import { BrandMark } from "@/components/layout/BrandMark"
import { useCustomerAuthStore } from "@/store/auth-store"
import { sanitizeRedirect } from "@/lib/utils"

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

/**
 * Customer-only login for the public storefront and customer portal. Never
 * looks at the admin session and never authenticates against the admin
 * role — an existing admin session on this browser has no effect here, and
 * a password that only belongs to an admin account is rejected below with
 * the same "invalid credentials" message a wrong password would get. Admin
 * sign-in lives entirely at /admin/login (see pages/admin/AdminLogin.tsx).
 */
export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const customer = useCustomerAuthStore((s) => s.customer)
  const customerLogin = useCustomerAuthStore((s) => s.login)
  const customerGoogleLogin = useCustomerAuthStore((s) => s.googleLogin)

  // Arriving via "?redirect=/checkout" (see Checkout.tsx / CustomerLayout.tsx)
  // sends the visitor back to whatever they were trying to reach instead of
  // dropping them on the generic dashboard.
  const redirectTo = sanitizeRedirect(searchParams.get("redirect"), "/dashboard")
  const redirectQuery = searchParams.get("redirect")
    ? `?redirect=${encodeURIComponent(searchParams.get("redirect")!)}`
    : ""

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  if (customer) return <Navigate to={redirectTo} replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const result = await customerLogin(email, password)
      if (result.success) {
        toast.success("Logged in successfully. Welcome back!")
        navigate(redirectTo)
        return
      }
      const message = result.error ?? "Invalid credentials."
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGoogleSuccess(credentialResponse: CredentialResponse) {
    if (!credentialResponse.credential) {
      toast.error("Google didn't return a credential. Please try again.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await customerGoogleLogin(credentialResponse.credential)
      if (result.success) {
        toast.success("Logged in successfully. Welcome back!")
        navigate(redirectTo)
        return
      }
      setError(result.error)
      toast.error(result.error)
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
          <BrandMark
            className="size-9 rounded-xl"
            fallback={
              <div className="flex size-9 items-center justify-center rounded-xl bg-white/15">
                <Zap className="size-5" fill="currentColor" />
              </div>
            }
          />
          <span className="text-lg font-bold tracking-tight">VR's NEXORA</span>
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold leading-tight">Welcome Back!</h1>
          <p className="max-w-sm text-white/70">
            Sign in to manage your digital business card, track engagement, and keep your profile
            up to date — all in one place.
          </p>

          <div className="relative mt-10 h-48 w-72">
            <div className="absolute left-6 top-8 h-32 w-56 rotate-[-8deg] rounded-2xl border border-white/20 bg-white/10 shadow-xl backdrop-blur-sm" />
            <div className="absolute left-3 top-4 h-32 w-56 rotate-[4deg] rounded-2xl border border-white/20 bg-white/10 shadow-xl backdrop-blur-sm" />
            <div className="absolute left-0 top-0 flex h-32 w-56 flex-col justify-between rounded-2xl border border-white/30 bg-white/15 p-4 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between">
                <Zap className="size-6" fill="currentColor" />
                <Fingerprint className="size-5 text-white/70" />
              </div>
              <div>
                <p className="text-sm font-semibold">Srinadh R</p>
                <p className="text-xs text-white/60">Software Developer</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-sm text-white/60">
          <Sparkles className="size-4" />
          Trusted by thousands of professionals
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex w-full flex-1 items-center justify-center overflow-y-auto px-6 py-10 md:w-1/2">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1 md:hidden">
            <div className="flex items-center gap-2">
              <BrandMark
                className="size-9 rounded-xl"
                fallback={
                  <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Zap className="size-5" fill="currentColor" />
                  </div>
                }
              />
              <span className="text-lg font-bold tracking-tight">VR's NEXORA</span>
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Login to Your Account</h2>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access your dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-muted-foreground">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="font-medium text-primary hover:underline"
              >
                Forgot Password?
              </button>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Signing in..." : "Login"}
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {GOOGLE_CLIENT_ID ? (
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error("Google sign-in failed. Please try again.")}
                text="signin_with"
                shape="rectangular"
                width="320"
              />
            </div>
          ) : (
            // Mirrors GoogleLoginView's own 501 "not configured" response —
            // no dead/broken button rendered when the client ID is unset.
            <p className="text-center text-xs text-muted-foreground">
              Google sign-in isn't configured on this deployment yet.
            </p>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link to={`/register${redirectQuery}`} className="font-medium text-primary hover:underline">
              Sign Up
            </Link>
          </p>

          <p className="text-center text-xs text-muted-foreground">
            <Link to="/admin/login" className="hover:underline">
              Admin? Sign in here
            </Link>
          </p>
        </div>
      </div>

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  )
}
