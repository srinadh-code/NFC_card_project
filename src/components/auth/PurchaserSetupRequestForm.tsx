import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError, authApi } from "@/lib/api"

export function PurchaserSetupRequestForm() {
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const waiting = cooldown > 0

  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [waiting])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!email.trim() || sending || waiting) return
    setSending(true)
    setError(null)
    setSent(false)
    try {
      await authApi.requestPurchaserSetup(email)
      setSent(true)
      setCooldown(30)
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Couldn't request your setup link. Please try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="purchaser-setup-email">Purchaser Email</Label>
        <Input id="purchaser-setup-email" type="email" autoComplete="email" required maxLength={254} value={email}
          onChange={(event) => { setEmail(event.target.value); setSent(false); setError(null) }} />
      </div>
      {sent && (
        <p role="status" className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          If this email belongs to a purchaser who needs account setup, a new link will be sent to that inbox. Open it to create your password.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={sending || waiting || !email.trim()}>
        {sending && <Loader2 className="size-4 animate-spin" />}
        {sending ? "Sending..." : waiting ? `Request again in ${cooldown}s` : "Email My Setup Link"}
      </Button>
    </form>
  )
}
