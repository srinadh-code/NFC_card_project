import { useState } from "react"
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { ShieldCheck, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog"
import { useAdminAuthStore } from "@/store/auth-store"
import { sanitizeRedirect } from "@/lib/utils"

/**
 * Admin-only login, isolated at /admin/login. Never looks at the customer
 * session and never authenticates against the customer role — a customer's
 * correct password is rejected here exactly like a wrong one would be,
 * since useAdminAuthStore's login() only succeeds for role === "ADMIN".
 * This page never redirects anywhere in the public site or customer
 * portal; success only ever lands on /admin/dashboard (or the requested
 * ?redirect= admin path).
 */
export default function AdminLogin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const admin = useAdminAuthStore((s) => s.admin)
  const adminLogin = useAdminAuthStore((s) => s.login)

  const redirectParam = searchParams.get("redirect")
  const redirectTo =
    redirectParam && redirectParam.startsWith("/admin/")
      ? sanitizeRedirect(redirectParam, "/admin/dashboard")
      : "/admin/dashboard"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  if (admin) return <Navigate to={redirectTo} replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const result = await adminLogin(email, password)
      if (result.success) {
        toast.success("Welcome back, Admin!")
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

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-muted/40 px-6 py-10">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 shadow-lg">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-6" />
          </div>
          <div className="space-y-1">
            <h1 className="flex items-center justify-center gap-1.5 text-xl font-bold tracking-tight">
              <Zap className="size-4" fill="currentColor" /> VR's NEXORA
            </h1>
            <p className="text-sm text-muted-foreground">Admin Portal sign-in</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="email"
              placeholder="admin@vrsnexora.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Password</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-end text-sm">
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="font-medium text-primary hover:underline"
            >
              Forgot Password?
            </button>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? "Signing in..." : "Login to Admin Portal"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Not an admin?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Customer login
          </Link>
        </p>
      </div>

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  )
}
