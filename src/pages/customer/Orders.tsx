import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2, Circle, Download, Mail, PackageSearch } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorState } from "@/components/customer/ErrorState"
import { useCustomerAuthStore } from "@/store/auth-store"
<<<<<<< HEAD
import { ordersApi, type ApiOrder } from "@/lib/api"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/mock-api"
import { orderStatusLabel } from "@/lib/order-status"
=======
import { useDataStore } from "@/store/data-store"
import { customerOrderApi } from "@/lib/api"
import { formatCurrency, formatDate } from "@/lib/mock-api"
import type { Order, OrderStatus } from "@/types"
>>>>>>> b82680aac13f3627b3ea99a2417041dd3442cc04

function productSummary(order: ApiOrder) {
  const [first, ...rest] = order.items
  if (!first) return "—"
  const extraQty = rest.reduce((s, i) => s + i.quantity, 0)
  const label = `${first.card_type} (${first.color}) ×${first.quantity}`
  return extraQty > 0 ? `${label} +${extraQty} more` : label
}

function downloadInvoice(order: ApiOrder) {
  const lines = [
    `VR's NEXORA — Invoice for ${order.order_number}`,
    `Date: ${formatDate(order.created_at)}`,
    `Status: ${orderStatusLabel(order.status)}`,
    "",
    "Items:",
    ...order.items.map(
      (it) => `  - ${it.card_type} (${it.color}) x${it.quantity} @ ${formatCurrency(Number(it.unit_price))}`,
    ),
    "",
    `Subtotal: ${formatCurrency(Number(order.subtotal))}`,
    `Discount: ${formatCurrency(Number(order.discount))}`,
    `Total: ${formatCurrency(Number(order.total))}`,
    "",
    `Shipping Address: ${order.shipping_address}, ${order.shipping_city}, ${order.shipping_state} ${order.shipping_postal_code}, ${order.shipping_country}`,
  ]
  const blob = new Blob([lines.join("\n")], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `invoice-${order.order_number}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast.success("Invoice downloaded.")
}

export default function CustomerOrders() {
  const customer = useCustomerAuthStore((s) => s.customer)
<<<<<<< HEAD
  const [page, setPage] = useState(1)
  const [trackOrder, setTrackOrder] = useState<ApiOrder | null>(null)

  const ordersQuery = useQuery({
    queryKey: ["customer-orders", page],
    queryFn: () => ordersApi.list(page),
    enabled: Boolean(customer),
=======
  // No customer-facing support-ticket API exists yet (admin_api/support is
  // admin-only) — the "Contact Support" dialog below still logs into the
  // local mock ticket store until that endpoint exists.
  const addTicket = useDataStore((s) => s.addTicket)

  const { data, isLoading } = useQuery({
    queryKey: ["customer-orders", customer?.id],
    queryFn: async () => (await customerOrderApi.mine()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    enabled: Boolean(customer?.id),
>>>>>>> b82680aac13f3627b3ea99a2417041dd3442cc04
  })

  if (!customer) return null

  const orders = ordersQuery.data?.items ?? []
  const pagination = ordersQuery.data?.pagination

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">View your order history and track deliveries.</p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Order History</CardTitle>
        </CardHeader>
        <CardContent>
          {ordersQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : ordersQuery.isError ? (
            <ErrorState error={ordersQuery.error} onRetry={() => ordersQuery.refetch()} />
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <PackageSearch className="size-10 text-muted-foreground" />
              <p className="font-medium">You haven&apos;t placed any orders yet.</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Ready for your own digital card?{" "}
                <a href="/shop" className="font-medium text-primary hover:underline">
                  Order one now
                </a>
                .
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs font-medium">{order.order_number}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(order.created_at)}</TableCell>
                      <TableCell>{productSummary(order)}</TableCell>
                      <TableCell>
                        <Badge>{orderStatusLabel(order.status)}</Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(Number(order.total))}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setTrackOrder(order)}>
                            Track
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => downloadInvoice(order)}>
                            <Download className="size-3.5" /> Invoice
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {pagination && pagination.num_pages > 1 && (
                <Pagination className="mt-4 justify-end">
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
        </CardContent>
      </Card>

      {orders.length > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Mail className="size-3.5" /> Need help with an order? Email{" "}
          <a href="mailto:support@vrsnexora.com" className="font-medium text-primary hover:underline">
            support@vrsnexora.com
          </a>
        </p>
      )}

      {/* Track order dialog */}
      <Dialog open={Boolean(trackOrder)} onOpenChange={(open) => !open && setTrackOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Track Order {trackOrder?.order_number}</DialogTitle>
            <DialogDescription>Status history for this order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {trackOrder?.status_history.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  {trackOrder.status_history.length - 1 === i ? (
                    <CheckCircle2 className="size-5 text-success" />
                  ) : (
                    <Circle className="size-5 text-muted-foreground" />
                  )}
                  {i < trackOrder.status_history.length - 1 && <div className="mt-1 h-8 w-px bg-success" />}
                </div>
                <div className="pb-2">
                  <p className="text-sm font-medium">{orderStatusLabel(step.status)}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(step.created_at)}</p>
                  {step.note && <p className="text-xs text-muted-foreground">{step.note}</p>}
                </div>
              </div>
            ))}
            {trackOrder?.tracking_number && (
              <p className="text-sm">
                Tracking Number: <span className="font-mono">{trackOrder.tracking_number}</span>
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
