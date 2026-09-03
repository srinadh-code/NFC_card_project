import { useState, type FormEvent } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Zap, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAdminAuthStore, ADMIN_DEMO_CREDENTIALS } from "@/store/auth-store"

export default function AdminLogin() {
  const admin = useAdminAuthStore((s) => s.admin)
  const login = useAdminAuthStore((s) => s.login)
  const navigate = useNavigate()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (admin) return <Navigate to="/admin/dashboard" replace />

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    // Simulate a brief network round-trip for the demo auth flow.
    setTimeout(() => {
      const result = login(email, password)
      setSubmitting(false)
      if (result.success) {
        toast.success("Welcome back, Admin!")
        navigate("/admin/dashboard")
      } else {
        const message = result.error ?? "Invalid email or password."
        setError(message)
        toast.error(message)
      }
    }, 400)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm rounded-xl shadow-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Zap className="size-6" />
          </div>
          <CardTitle className="text-xl">TapLink</CardTitle>
          <CardDescription>Admin Login</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@taplink.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="mt-1 w-full" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Login
            </Button>
          </form>
          <p className="mt-5 rounded-md bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
            Demo credentials: <span className="font-medium text-foreground">{ADMIN_DEMO_CREDENTIALS.email}</span> /{" "}
            <span className="font-medium text-foreground">{ADMIN_DEMO_CREDENTIALS.password}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
