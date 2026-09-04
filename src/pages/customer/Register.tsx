import { useEffect, useRef, useState } from "react"
import { Navigate, Link, useNavigate, useLocation } from "react-router-dom"
import { toast } from "sonner"
import { Check, ShieldCheck, Sparkles, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCustomerAuthStore } from "@/store/auth-store"

const DEMO_OTP = "284671"
const CHECKLIST = [
  "Digital Business Profile",
  "Easy Sharing",
  "Real-time Analytics",
  "Secure & Reliable",
]

export default function CustomerRegister() {
  const navigate = useNavigate()
  const location = useLocation()
  const customer = useCustomerAuthStore((s) => s.customer)
  const registerUser = useCustomerAuthStore((s) => s.register)

  // Mirrors Login.tsx: if we arrived via the "order a card while logged
  // out" redirect, send the new account straight back to finish checkout.
  const redirectTo = (location.state as { from?: string } | null)?.from || "/dashboard"

  const [step, setStep] = useState<1 | 2>(1)
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" })
  const [formError, setFormError] = useState<string | null>(null)

  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [otpError, setOtpError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(45)
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (step !== 2) return
    setSecondsLeft(45)
  }, [step])

  useEffect(() => {
    if (step !== 2 || secondsLeft <= 0) return
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [step, secondsLeft])

  if (customer) return <Navigate to={redirectTo} replace />

  function handleStep1Submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.password.trim()) {
      setFormError("Please fill in all fields to continue.")
      return
    }
    setFormError(null)
    toast.success(`Verification code sent to ${form.email}`)
    setStep(2)
  }

  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1)
    const next = [...otp]
    next[index] = digit
    setOtp(next)
    if (digit && index < 5) inputsRef.current[index + 1]?.focus()
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
  }

  function handleVerify() {
    const code = otp.join("")
    if (code.length !== 6) {
      setOtpError("Please enter the complete 6-digit code.")
      return
    }
    setOtpError(null)
    const result = registerUser(
      form.name,
      form.email,
      form.phone ? `+91 ${form.phone}` : undefined,
      form.password,
    )
    if (!result.success) {
      setOtpError(result.error ?? "Something went wrong. Please try again.")
      toast.error(result.error ?? "Something went wrong. Please try again.")
      return
    }
    toast.success(`Welcome to VR's NEXORA, ${form.name.split(" ")[0]}!`)
    navigate(redirectTo)
  }

  function handleResend() {
    setSecondsLeft(45)
    toast.success("A new verification code has been sent.")
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
          {step === 1 ? (
            <>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold tracking-tight">Sign Up</h2>
                <p className="text-sm text-muted-foreground">
                  Create your VR's NEXORA account to get started.
                </p>
              </div>

              <form onSubmit={handleStep1Submit} className="space-y-4">
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

                <Button type="submit" className="w-full" size="lg">
                  Sign Up
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" state={location.state} className="font-medium text-primary hover:underline">
                  Login
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldCheck className="size-6" />
                </div>
                <h2 className="pt-3 text-2xl font-bold tracking-tight">Verify Your Email</h2>
                <p className="text-sm text-muted-foreground">
                  We&apos;ve sent a 6-digit code to <span className="font-medium text-foreground">{form.email}</span>.
                  For this demo, the code is{" "}
                  <span className="font-mono font-semibold text-foreground">{DEMO_OTP}</span>.
                </p>
              </div>

              <div className="flex justify-between gap-2">
                {otp.map((digit, i) => (
                  <Input
                    key={i}
                    ref={(el) => {
                      inputsRef.current[i] = el
                    }}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    inputMode="numeric"
                    maxLength={1}
                    className="h-12 w-12 text-center text-lg font-semibold"
                  />
                ))}
              </div>

              {otpError && <p className="text-sm text-destructive">{otpError}</p>}

              <Button onClick={handleVerify} className="w-full" size="lg">
                Verify &amp; Continue
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {secondsLeft > 0 ? (
                  <>Resend Code (00:{String(secondsLeft).padStart(2, "0")})</>
                ) : (
                  <button type="button" onClick={handleResend} className="font-medium text-primary hover:underline">
                    Resend Code
                  </button>
                )}
              </p>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="block w-full text-center text-sm font-medium text-muted-foreground hover:underline"
              >
                Back to details
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
