import { useState } from "react"
import { Navigate, Link, useNavigate, useLocation } from "react-router-dom"
import { toast } from "sonner"
import { CreditCard, Fingerprint, Sparkles, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  useAdminAuthStore,
  useCustomerAuthStore,
  ADMIN_DEMO_CREDENTIALS,
  CUSTOMER_DEMO_CREDENTIALS,
} from "@/store/auth-store"

/**
 * Single unified login for both roles. Tries the customer store first (it
 * also covers self-registered accounts), then the admin store — each store's
 * own `login()` still owns its credential check, so this page only decides
 * where to send the user once one of them succeeds.
 */
export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()

  const admin = useAdminAuthStore((s) => s.admin)
  const adminLogin = useAdminAuthStore((s) => s.login)
  const customer = useCustomerAuthStore((s) => s.customer)
  const customerLogin = useCustomerAuthStore((s) => s.login)

  // If we got here via the "order a card while logged out" redirect (see
  // Checkout.tsx), send the customer right back to finish checkout instead
  // of dropping them on the dashboard.
  const redirectTo = (location.state as { from?: string } | null)?.from || "/dashboard"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forgotOpen, setForgotOpen] = useState(false)

  if (admin) return <Navigate to="/admin/dashboard" replace />
  if (customer) return <Navigate to={redirectTo} replace />

  function attemptLogin(loginEmail: string, loginPassword: string) {
    const customerResult = customerLogin(loginEmail, loginPassword)
    if (customerResult.success) return { success: true as const, role: "customer" as const }

    const adminResult = adminLogin(loginEmail, loginPassword)
    if (adminResult.success) return { success: true as const, role: "admin" as const }

    return { success: false as const, error: customerResult.error ?? adminResult.error }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = attemptLogin(email, password)
    if (result.success) {
      if (result.role === "admin") {
        toast.success("Welcome back, Admin!")
        navigate("/admin/dashboard")
      } else {
        toast.success("Logged in successfully. Welcome back!")
        navigate(redirectTo)
      }
    } else {
      setError(result.error ?? "Invalid credentials.")
      toast.error(result.error ?? "Invalid credentials.")
    }
  }

  function handleGoogleLogin() {
    customerLogin(CUSTOMER_DEMO_CREDENTIALS.email, CUSTOMER_DEMO_CREDENTIALS.password)
    toast.success("Signed in with Google (demo)")
    navigate(redirectTo)
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
          <span className="text-lg font-bold tracking-tight">TapLink</span>
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
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Zap className="size-5" fill="currentColor" />
              </div>
              <span className="text-lg font-bold tracking-tight">TapLink</span>
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

            <Button type="submit" className="w-full" size="lg">
              Login
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" size="lg" className="w-full" onClick={handleGoogleLogin}>
            <svg viewBox="0 0 24 24" className="size-4">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29A11.96 11.96 0 000 12c0 1.93.46 3.76 1.29 5.38l3.98-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
              />
            </svg>
            Login with Google
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              to="/register"
              state={location.state}
              className="font-medium text-primary hover:underline"
            >
              Sign Up
            </Link>
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-muted/40 p-4 text-xs text-muted-foreground">
              <p className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                <CreditCard className="size-3.5" /> Customer demo
              </p>
              <p>
                Email: <span className="font-mono text-foreground">{CUSTOMER_DEMO_CREDENTIALS.email}</span>
              </p>
              <p>
                Password: <span className="font-mono text-foreground">{CUSTOMER_DEMO_CREDENTIALS.password}</span>
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4 text-xs text-muted-foreground">
              <p className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                <CreditCard className="size-3.5" /> Admin demo
              </p>
              <p>
                Email: <span className="font-mono text-foreground">{ADMIN_DEMO_CREDENTIALS.email}</span>
              </p>
              <p>
                Password: <span className="font-mono text-foreground">{ADMIN_DEMO_CREDENTIALS.password}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forgot Password</DialogTitle>
            <DialogDescription>
              Password reset isn&apos;t available in this demo — please use one of the demo
              credentials shown on the login page to sign in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setForgotOpen(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
