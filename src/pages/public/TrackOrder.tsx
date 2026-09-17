import { useState, type FormEvent } from "react"
import { CheckCircle2, Download, Loader2, PackageX, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import PageHeader from "@/components/marketing/PageHeader"
import { OrderTrackingView } from "@/components/orders/OrderTrackingView"
import { ApiError, publicOrderTrackingApi, toFrontendPublicOrder } from "@/lib/api"
import { formatCurrency, formatDate } from "@/lib/mock-api"
import type { Order } from "@/types"
import { usePublicSettings } from "@/hooks/usePublicSettings"

// Real backend lookup: GET /api/orders/track/<order_number>/ (see
// orders.views.PublicOrderTrackingView) — unauthenticated, keyed by the
// order's real public order_number (e.g. "NXTRK250344", see
// Order.generate_order_number in the backend), never the internal numeric
// database id. The lookup is case-insensitive server-side.
const INFO_POINTS = ["Order status", "Estimated delivery", "Shipment progress", "Courier tracking"]

type SearchState = "idle" | "loading" | "found" | "not-found" | "error"

export default function TrackOrder() {
  const { settings } = usePublicSettings()
  const [orderIdInput, setOrderIdInput] = useState("")
  const [state, setState] = useState<SearchState>("idle")
  const [result, setResult] = useState<Order | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [isRefreshing, setIsRefreshing] = useState(false)

  async function runLookup(rawOrderId: string): Promise<void> {
    const orderId = rawOrderId.trim()
    if (!/^[A-Za-z0-9]+$/.test(orderId)) {
      setState("not-found")
      setErrorMessage("Please enter a valid Order ID.")
      return
    }
    try {
      const apiOrder = await publicOrderTrackingApi.track(orderId)
      setResult(toFrontendPublicOrder(apiOrder))
      setState("found")
    } catch (err) {
      setResult(null)
      if (err instanceof ApiError && err.status === 404) {
        setState("not-found")
        setErrorMessage("")
      } else {
        setState("error")
        setErrorMessage(err instanceof ApiError ? err.message : "Couldn't reach the server. Please try again.")
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const query = orderIdInput.trim()
    if (!query) {
      toast.error("Please enter an Order ID.")
      return
    }
    setState("loading")
    await runLookup(query)
  }

  async function handleRefresh() {
    if (!result) return
    setIsRefreshing(true)
    await runLookup(result.id)
    setIsRefreshing(false)
  }

  function handleDownloadInvoice(order: Order) {
    const content = [
      `${settings.site_name} Invoice`,
      `Order ID: ${order.id}`,
      `Date: ${formatDate(order.date, settings.timezone)}`,
      `Customer: ${order.customerName}`,
      `Payment Method: ${order.paymentMethod}`,
      ``,
      `Items:`,
      ...order.items.map(
        (i) => `- ${i.name} (${i.cardType}, ${i.color}) x${i.qty} — ${formatCurrency(i.price * i.qty, settings.currency)}`,
      ),
      ``,
      `Subtotal: ${formatCurrency(order.amount, settings.currency)}`,
      `Shipping: ${formatCurrency(order.shipping, settings.currency)}`,
      `Total: ${formatCurrency(order.total, settings.currency)}`,
    ].join("\n")
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${order.id}-invoice.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success("Invoice downloaded")
  }

  return (
    <div>
      <PageHeader
        title="Track Your Order"
        subtitle="Enter your order ID to view delivery progress, estimated delivery and shipment details."
      />

      <section className="px-4 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="order-id">Order ID</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="order-id"
                  placeholder="e.g. NXTRK250344"
                  className="pl-9"
                  value={orderIdInput}
                  onChange={(e) => setOrderIdInput(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" size="lg" disabled={state === "loading"}>
              {state === "loading" ? <Loader2 className="size-4 animate-spin" /> : null}
              {state === "loading" ? "Tracking Order..." : "Track Order"}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            You'll find your Order ID on your order confirmation or in your Orders page.
          </p>
        </div>

        <div className="mx-auto mt-6 flex max-w-xl flex-wrap justify-center gap-x-6 gap-y-2">
          {INFO_POINTS.map((point) => (
            <span key={point} className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-primary" /> {point}
            </span>
          ))}
        </div>

        {state === "loading" && (
          <div className="mx-auto mt-10 max-w-2xl space-y-3">
            <p className="text-center text-sm text-muted-foreground">Loading order details...</p>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        )}

        {state === "not-found" && (
          <div className="mx-auto mt-10 flex max-w-xl flex-col items-center rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <PackageX className="size-6" />
            </span>
            <p className="mt-4 font-semibold text-foreground">Order not found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {errorMessage || "Please check your order ID and try again."}
            </p>
          </div>
        )}

        {state === "error" && (
          <div className="mx-auto mt-10 flex max-w-xl flex-col items-center rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <PackageX className="size-6" />
            </span>
            <p className="mt-4 font-semibold text-foreground">Unable to load order details.</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => runLookup(orderIdInput)}>
              Retry
            </Button>
          </div>
        )}

        {state === "found" && result && (
          <div className="mx-auto mt-10 max-w-2xl">
            <OrderTrackingView
              order={result}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              onViewDetails={() => handleDownloadInvoice(result)}
            />
            <div className="mt-3 flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => handleDownloadInvoice(result)}>
                <Download className="size-3.5" /> Download Invoice
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
