import { useState } from "react"
import { Navigate, Link, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Check, Sparkles, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCustomerAuthStore, useAuthStore } from "@/store/auth-store"
import { ApiError, authApi, setTokens } from "@/lib/api"
import { sanitizeRedirect } from "@/lib/utils"

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

  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" })
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (customer) return <Navigate to={redirectTo} replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.password.trim()) {
      setFormError("Please fill in all fields to continue.")
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
      const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again."
      setFormError(message)
      toast.error(message)
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
              <div className="flex items-center rounded-md border shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50">
                <span className="border-r px-3 py-2 text-sm text-muted-foreground">+91</span>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="98765 43210"
                  className="border-0 shadow-none focus-visible:ring-0"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-password">Password</Label>
              <Input
                id="reg-password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

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
