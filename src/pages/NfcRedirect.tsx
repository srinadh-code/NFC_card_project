import { useEffect, useState } from "react"
import { useLocation, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { nfcApi, ApiError } from "@/lib/api"
import { safeNfcDestination } from "@/lib/nfc-destination"
import { Button } from "@/components/ui/button"

export default function NfcRedirect() {
  const { identifier = "" } = useParams()
  const { search } = useLocation()
  const [failure, setFailure] = useState({ key: "", message: "" })
  const [attempt, setAttempt] = useState(0)
  const requestKey = JSON.stringify([identifier, search, attempt])
  const error = failure.key === requestKey ? failure.message : ""
  useEffect(() => {
    let current = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const source = new URLSearchParams(search).get("source") === "qr" ? "qr" : undefined
    void nfcApi.resolve(identifier, source, controller.signal).then((result) => {
      if (!current) return
      const destination = safeNfcDestination(result.redirect_url, window.location.origin)
      if (!destination) throw new Error("This card's destination is unavailable.")
      window.location.replace(destination)
    }).catch((err: unknown) => {
      if (current) setFailure({ key: requestKey, message: err instanceof ApiError ? err.message : "We couldn't open this card. Please try again or contact its owner." })
    }).finally(() => clearTimeout(timeout))
    return () => { current = false; controller.abort(); clearTimeout(timeout) }
  }, [identifier, search, requestKey])
  return <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
    {error ? <><h1 className="text-xl font-semibold">Card unavailable</h1><p role="alert" className="text-muted-foreground">{error}</p><Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button></> : <><Loader2 className="size-8 animate-spin" /><p>Opening card…</p></>}
  </main>
}
