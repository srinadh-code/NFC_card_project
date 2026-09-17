import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Download, Mail, PackageSearch, Truck } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { ErrorState } from "@/components/customer/ErrorState"
import { OrderTrackingView } from "@/components/orders/OrderTrackingView"
import { useCustomerAuthStore } from "@/store/auth-store"
import { ordersApi, toFrontendOrder, type ApiOrder } from "@/lib/api"
import { formatCurrency, formatDate } from "@/lib/mock-api"
import { deriveCurrentStatus, estimateDeliveryWindow } from "@/lib/order-tracking"
import type { Order } from "@/types"

function downloadInvoice(order: ApiOrder) {
  const orderNumber = order.order_number ?? String(order.id)
  const lines = [
    `VR's NEXORA — Invoice for Order #${orderNumber}`,
    `Date: ${formatDate(order.placed_at)}`,
    `Status: ${order.status}`,
    "",
    "Items:",
    ...order.items.map(
      (it) => `  - ${it.name} — ${it.card_type} (${it.color}) x${it.qty} @ ${formatCurrency(Number(it.price))}`,
    ),
    "",
    `Amount: ${formatCurrency(Number(order.amount))}`,
    `Shipping: ${formatCurrency(Number(order.shipping))}`,
    `Total: ${formatCurrency(Number(order.total))}`,
    "",
    `Shipping Address: ${order.address.line1}, ${order.address.city}, ${order.address.state} ${order.address.pincode}, ${order.address.country}`,
  ]
  const blob = new Blob([lines.join("\n")], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `invoice-order-${orderNumber}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast.success("Invoice downloaded.")
}

/** One order, presented as a premium tracking-forward card instead of a
 * plain table row — real data only (ApiOrder → the same normalized Order
 * shape admin's orders and the public Track Order page already use, via
 * the shared toFrontendOrder adapter), no fields invented per card. */
function OrderCard({ order, onTrack }: { order: Order; onTrack: () => void }) {
  const current = deriveCurrentStatus(order)
  const deliveryWindow = estimateDeliveryWindow(order)
  const [first, ...rest] = order.items
  const extraQty = rest.reduce((s, i) => s + i.qty, 0)

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold text-muted-foreground">
            ORDER #{order.orderNumber ?? order.id}
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {first ? `${first.name} · Qty: ${first.qty}${extraQty > 0 ? ` +${extraQty} more` : ""}` : "—"}
          </p>
        </div>
        <StatusBadge status={current.label} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Order Date</p>
          <p className="font-medium text-foreground">{formatDate(order.date)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="font-medium text-foreground">{formatCurrency(order.total)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Estimated Delivery</p>
          <p className="font-medium text-foreground">
            {deliveryWindow
              ? `${formatDate(deliveryWindow.from.toISOString())} – ${formatDate(deliveryWindow.to.toISOString())}`
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Current Status</p>
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <span
              className={`size-1.5 rounded-full ${current.kind === "cancelled" ? "bg-destructive" : current.kind === "delivered" ? "bg-success" : "bg-primary"}`}
            />
            {current.label}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={onTrack}>
          <Truck className="size-3.5" /> Track Order
        </Button>
        <Button variant="outline" size="sm" onClick={onTrack}>
          View Details
        </Button>
      </div>
    </div>
  )
}

export default function CustomerOrders() {
  const customer = useCustomerAuthStore((s) => s.customer)
  const [page, setPage] = useState(1)
  const [trackingApiOrder, setTrackingApiOrder] = useState<ApiOrder | null>(null)

  const ordersQuery = useQuery({
    queryKey: ["customer-orders", page],
    queryFn: () => ordersApi.list(page),
    enabled: Boolean(customer),
  })

  if (!customer) return null

  const orders = ordersQuery.data?.items ?? []
  const pagination = ordersQuery.data?.pagination
  const trackingOrder = trackingApiOrder ? toFrontendOrder(trackingApiOrder) : null

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">View your order history and track deliveries.</p>
      </div>

      {ordersQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : ordersQuery.isError ? (
        <Card className="rounded-2xl">
          <CardContent className="py-8">
            <ErrorState error={ordersQuery.error} onRetry={() => ordersQuery.refetch()} />
          </CardContent>
        </Card>
      ) : orders.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PackageSearch className="size-7" />
            </span>
            <p className="text-base font-semibold text-foreground">No orders yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Your NEXORA NFC card orders will appear here.
            </p>
            <Button asChild className="mt-2">
              <a href="/shop">Explore NEXORA Cards</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {orders.map((order) => (
              <OrderCard key={order.id} order={toFrontendOrder(order)} onTrack={() => setTrackingApiOrder(order)} />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="size-3.5" /> Need help with an order? Email{" "}
              <a href="mailto:support@vrsnexora.com" className="font-medium text-primary hover:underline">
                support@vrsnexora.com
              </a>
            </p>
            {orders.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => downloadInvoice(orders[0])}
                className="text-muted-foreground"
              >
                <Download className="size-3.5" /> Download latest invoice
              </Button>
            )}
          </div>

          {pagination && pagination.num_pages > 1 && (
            <Pagination className="justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      setPage((p) => Math.max(1, p - 1))
                    }}
                  />
                </PaginationItem>
                {Array.from({ length: pagination.num_pages }).map((_, i) => (
                  <PaginationItem key={i}>
                    <PaginationLink
                      href="#"
                      isActive={pagination.page === i + 1}
                      onClick={(e) => {
                        e.preventDefault()
                        setPage(i + 1)
                      }}
                    >
                      {i + 1}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      setPage((p) => Math.min(pagination.num_pages, p + 1))
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}

      {/* Track order dialog — the full shared tracking experience */}
      <Dialog open={Boolean(trackingApiOrder)} onOpenChange={(open) => !open && setTrackingApiOrder(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Track Your Order</DialogTitle>
            <DialogDescription>Live shipping status and delivery details.</DialogDescription>
          </DialogHeader>
          {trackingOrder && (
            <OrderTrackingView
              order={trackingOrder}
              onRefresh={() => ordersQuery.refetch()}
              isRefreshing={ordersQuery.isFetching}
              showShippingDetails={false}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
