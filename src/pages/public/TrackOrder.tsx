import { useEffect, useState, type FormEvent } from "react"
import { useLocation, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, Circle, PackageSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import PageHeader from "@/components/marketing/PageHeader"
import { ApiError, NetworkError, ordersApi } from "@/lib/api"
import { formatDate } from "@/lib/mock-api"
import { cn } from "@/lib/utils"
import { usePublicSettings } from "@/hooks/usePublicSettings"

const CANCELLED = "CANCELLED"
const DELIVERED = "DELIVERED"

// Title-cases the backend's real status choices (PENDING/PROCESSING/
// SHIPPED/DELIVERED/COMPLETED/CANCELLED) for display — never a
// frontend-invented status, just formatting the exact value Admin Orders
// itself set.
function formatStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase()
}

export default function TrackOrder() {
  const { settings } = usePublicSettings()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const [orderIdInput, setOrderIdInput] = useState(searchParams.get("order") ?? "")
  const [submittedQuery, setSubmittedQuery] = useState(searchParams.get("order") ?? "")

  // Purely cosmetic personalization ("Tracking order for Jane Doe") — only
  // ever available when this page was reached by an in-app navigation that
  // already knows the customer (OrderSuccess right after checkout, or the
  // customer dashboard), passed via router state so it never lands in a
  // shareable URL (see Checkout.tsx/OrderSuccess.tsx). It plays no role in
  // authorizing the request — the backend never sees it, only order+token
  // (see PublicOrderTrackingView) — so a page opened fresh from an emailed
  // link (no router state) simply has no name to show, which is fine.
  const customerName = (location.state as { customerName?: string } | null)?.customerName ?? null

  // The tracking token is the actual security credential — it only ever
  // comes from the URL (the link in OrderSuccess/the confirmation email,
  // both of which embed order.tracking_token automatically). There is no
  // input for it: a customer is never expected to see, copy, or type it.
  // See PublicOrderTrackingView — the order id alone is never enough.
  const [linkToken] = useState(searchParams.get("token") ?? "")
  const hasToken = linkToken.trim().length > 0

  // Arriving via the payment-success page's or confirmation email's "Track
  // Your Order" link (e.g. /track-order?order=ORD000013&token=...)
  // auto-tracks immediately, with zero action from the customer.
  useEffect(() => {
    const fromUrl = searchParams.get("order")
    if (fromUrl) {
      setOrderIdInput(fromUrl)
      setSubmittedQuery(fromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const query = useQuery({
    queryKey: ["track-order", submittedQuery, linkToken],
    queryFn: () => ordersApi.trackPublic(submittedQuery, linkToken),
    // Only ever calls the backend when a token is actually present — a bare
    // order id must never even reach the API, since the id alone can't
    // prove anything (see the "missing token" message below instead).
    enabled: submittedQuery.trim().length > 0 && hasToken,
    retry: false,
    // Real backend is the only source of truth — poll while the order is
    // still moving, and stop once it reaches a final state so this doesn't
    // keep hitting the API forever for an order that's already Delivered
    // or Cancelled.
    refetchInterval: (q) => {
      const status = q.state.data?.status
      if (!status || status === DELIVERED || status === CANCELLED) return false
      return 15_000
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedOrder = orderIdInput.trim()
    if (!trimmedOrder) return
    setSubmittedQuery(trimmedOrder)
  }

  const submitted = submittedQuery.trim().length > 0
  const missingToken = submitted && !hasToken
  const notFound = query.isError && query.error instanceof ApiError && query.error.status === 404
  const otherError = query.isError && !notFound

  return (
    <div>
      <PageHeader title="Track Your Order" subtitle="Enter your order ID to see its live status." />

      <section className="px-4 py-12">
        <div className="mx-auto max-w-xl">
          {customerName && (
            <p className="mb-3 text-sm text-muted-foreground">
              Tracking order for <span className="font-medium text-foreground">{customerName}</span>
            </p>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="order-id" className="sr-only">
                Order ID
              </Label>
              <Input
                id="order-id"
                placeholder="e.g. ORD000013"
                value={orderIdInput}
                onChange={(e) => setOrderIdInput(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={query.isFetching}>
              {query.isFetching ? "Tracking…" : "Track Order"}
            </Button>
          </form>
        </div>

        {query.isFetching && !query.data && (
          <div className="mx-auto mt-10 max-w-xl space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {missingToken && (
          <div className="mx-auto mt-10 flex max-w-xl flex-col items-center rounded-2xl border bg-card p-8 text-center shadow-sm">
            <PackageSearch className="size-10 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              Please use the tracking link from your order confirmation email to securely track this
              order.
            </p>
          </div>
        )}

        {!missingToken && notFound && (
          <div className="mx-auto mt-10 flex max-w-xl flex-col items-center rounded-2xl border bg-card p-8 text-center shadow-sm">
            <PackageSearch className="size-10 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              Unable to verify this tracking link. Please use the latest tracking link from your order
              confirmation email.
            </p>
          </div>
        )}

        {otherError && (
          <div className="mx-auto mt-10 flex max-w-xl flex-col items-center rounded-2xl border bg-card p-8 text-center shadow-sm">
            <PackageSearch className="size-10 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              {query.error instanceof NetworkError
                ? query.error.message
                : "Unable to track your order right now. Please try again."}
            </p>
          </div>
        )}

        {query.data && (
          <div className="mx-auto mt-10 grid max-w-4xl gap-8 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Order Details</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Order ID</dt>
                  <dd className="font-mono font-semibold text-foreground">{query.data.order_number}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Order Date</dt>
                  <dd className="text-foreground">{formatDate(query.data.placed_at, settings.timezone)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Last Updated</dt>
                  <dd className="text-foreground">{formatDate(query.data.updated_at, settings.timezone)}</dd>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <dt className="font-medium text-foreground">Current Status</dt>
                  <dd
                    className={cn(
                      "font-semibold",
                      query.data.status === CANCELLED ? "text-destructive" : "text-primary"
                    )}
                  >
                    {formatStatus(query.data.status)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Shipping Timeline</h2>
              <ol className="mt-5 space-y-6">
                {query.data.tracking.map((step, i) => (
                  <li key={step.label} className="relative flex gap-3 pl-1">
                    {i < query.data!.tracking.length - 1 && (
                      <span
                        className={cn(
                          "absolute left-[11px] top-6 h-full w-px",
                          step.done ? "bg-primary" : "bg-border"
                        )}
                      />
                    )}
                    {step.done ? (
                      <CheckCircle2 className="size-5.5 shrink-0 text-primary" />
                    ) : (
                      <Circle className="size-5.5 shrink-0 text-muted-foreground/40" />
                    )}
                    <div>
                      <p className={cn("text-sm font-medium", step.done ? "text-foreground" : "text-muted-foreground")}>
                        {step.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {step.date ? formatDate(step.date, settings.timezone) : "Pending"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              {query.data.status === CANCELLED && (
                <p className="mt-4 rounded-lg border border-dashed border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  This order was cancelled.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
