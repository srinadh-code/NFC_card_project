import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Search, Download, Eye, CheckCircle2, Circle, PackageCheck, Nfc } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { TablePagination } from "@/components/admin/TablePagination"
import { downloadCsv } from "@/components/admin/export-csv"
import { useDataStore } from "@/store/data-store"
import { simulateLatency, formatCurrency, formatDate, formatDateTime } from "@/lib/mock-api"
import type { Order, OrderStatus } from "@/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10
const STATUS_OPTIONS: (OrderStatus | "All")[] = [
  "All",
  "Pending",
  "Processing",
  "Shipped",
  "Delivered",
  "Completed",
  "Cancelled",
]

function productSummary(order: Order) {
  const [first, ...rest] = order.items
  if (!first) return "—"
  const extra = rest.reduce((s, i) => s + i.qty, 0)
  return extra > 0 ? `${first.name} +${extra} more` : first.name
}

export default function AdminOrders() {
  const queryClient = useQueryClient()
  const updateOrderStatus = useDataStore((s) => s.updateOrderStatus)
  const assignCardToOrder = useDataStore((s) => s.assignCardToOrder)
  const cards = useDataStore((s) => s.cards)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "All">("All")
  const [page, setPage] = useState(1)
  // Store just the id and always look the order up live from `orders` below
  // — a frozen local copy of the order would go stale the moment a mutation
  // (status change, card assignment) updates the store, since React Query
  // only patches its own cache, not any snapshot we'd copied out of it.
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null)
  const [cardChoice, setCardChoice] = useState<string>("")

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => simulateLatency(useDataStore.getState().orders, 300),
  })

  const viewing = orders.find((o) => o.id === viewingId) ?? null
  const assigningOrder = orders.find((o) => o.id === assigningOrderId) ?? null

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-orders"] })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => updateOrderStatus(id, status),
    onSuccess: (_data, vars) => {
      invalidate()
      toast.success(`Order ${vars.id} marked as ${vars.status}.`)
    },
  })

  const deliveredMutation = useMutation({
    mutationFn: async (id: string) => updateOrderStatus(id, "Delivered"),
    onSuccess: (_data, id) => {
      invalidate()
      toast.success(`Order ${id} marked as Delivered.`)
    },
  })

  const assignCardMutation = useMutation({
    mutationFn: async ({ orderId, cardId }: { orderId: string; cardId: string }) =>
      assignCardToOrder(orderId, cardId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
      queryClient.invalidateQueries({ queryKey: ["admin-cards"] })
      toast.success(`Card ${vars.cardId} assigned to order ${vars.orderId}.`)
      setAssigningOrderId(null)
      setCardChoice("")
    },
  })

  // Cards eligible to fulfill an order: unassigned stock, or a card already
  // tied to this exact customer/order (so re-opening the dialog still shows
  // the current pick).
  const availableCardsFor = (order: Order | null) =>
    order
      ? cards.filter((c) => c.status === "Unassigned" || c.id === order.assignedCardId)
      : []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      const matchesQuery =
        !q || o.id.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q)
      const matchesStatus = statusFilter === "All" || o.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [orders, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleExport() {
    downloadCsv(
      `orders-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((o) => ({
        OrderID: o.id,
        Customer: o.customerName,
        Phone: o.customerPhone,
        Email: o.customerEmail,
        Product: productSummary(o),
        Amount: o.total,
        PaymentMethod: o.paymentMethod,
        PaymentStatus: o.paymentStatus,
        Status: o.status,
        Date: formatDate(o.date),
      })),
    )
    toast.success("Orders exported to CSV.")
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">{orders.length} orders placed</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download /> Export
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by order ID or customer..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as OrderStatus | "All")
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "All" ? "All Status" : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.id}</TableCell>
                      <TableCell>{o.customerName}</TableCell>
                      <TableCell className="text-muted-foreground">{o.customerPhone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{o.customerEmail}</TableCell>
                      <TableCell>{productSummary(o)}</TableCell>
                      <TableCell>{formatCurrency(o.total)}</TableCell>
                      <TableCell>
                        <StatusBadge status={o.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(o.date)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setViewingId(o.id)}>
                            <Eye /> View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAssigningOrderId(o.id)
                              setCardChoice(o.assignedCardId ?? "")
                            }}
                          >
                            <Nfc /> {o.assignedCardId ? "Reassign" : "Assign Card"}
                          </Button>
                          {o.status !== "Delivered" && o.status !== "Completed" && o.status !== "Cancelled" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deliveredMutation.mutate(o.id)}
                              disabled={deliveredMutation.isPending}
                            >
                              <PackageCheck /> Mark Delivered
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pageItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                        No orders found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <TablePagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
          />
        </CardContent>
      </Card>

      <Sheet open={!!viewing} onOpenChange={(open) => !open && setViewingId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {viewing && (
            <>
              <SheetHeader>
                <SheetTitle>Order {viewing.id}</SheetTitle>
                <SheetDescription>
                  Placed on {formatDate(viewing.date)} by {viewing.customerName}
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-5 px-4 pb-4">
                <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p>{viewing.customerPhone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p>{viewing.customerEmail}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Order Status</span>
                  <Select
                    value={viewing.status}
                    onValueChange={(v) => statusMutation.mutate({ id: viewing.id, status: v as OrderStatus })}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.filter((s) => s !== "All").map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Assigned NFC Card</span>
                  {viewing.assignedCardId ? (
                    <span className="font-mono text-sm">{viewing.assignedCardId}</span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAssigningOrderId(viewing.id)
                        setCardChoice("")
                      }}
                    >
                      <Nfc /> Assign Card
                    </Button>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Items</p>
                  <div className="flex flex-col gap-2 rounded-lg border p-3">
                    {viewing.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span>
                          {item.name} ({item.color}) &times; {item.qty}
                        </span>
                        <span className="font-medium">{formatCurrency(item.price * item.qty)}</span>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Shipping</span>
                      <span>{viewing.shipping === 0 ? "Free" : formatCurrency(viewing.shipping)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>Total</span>
                      <span>{formatCurrency(viewing.total)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Payment</p>
                  <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span className="text-muted-foreground">{viewing.paymentMethod}</span>
                    <StatusBadge status={viewing.paymentStatus} />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Shipping Address</p>
                  <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                    {viewing.address.line1}, {viewing.address.city}, {viewing.address.state}{" "}
                    {viewing.address.pincode}, {viewing.address.country}
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Tracking</p>
                  <div className="flex flex-col gap-3">
                    {viewing.tracking.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        {step.done ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                        ) : (
                          <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        )}
                        <div>
                          <p className={cn("text-sm", step.done ? "font-medium" : "text-muted-foreground")}>
                            {step.label}
                          </p>
                          {step.date && (
                            <p className="text-xs text-muted-foreground">{formatDateTime(step.date)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!assigningOrder} onOpenChange={(open) => !open && setAssigningOrderId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign NFC Card</DialogTitle>
            <DialogDescription>
              Link a physical card to order {assigningOrder?.id} for {assigningOrder?.customerName}. Once
              assigned, it appears on the customer's My Card page ready to activate.
            </DialogDescription>
          </DialogHeader>
          <Select value={cardChoice} onValueChange={setCardChoice}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an unassigned card" />
            </SelectTrigger>
            <SelectContent>
              {availableCardsFor(assigningOrder).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.id} · {c.uid} ({c.cardType})
                </SelectItem>
              ))}
              {availableCardsFor(assigningOrder).length === 0 && (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">No unassigned cards in stock.</div>
              )}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigningOrderId(null)}>
              Cancel
            </Button>
            <Button
              disabled={!cardChoice || assignCardMutation.isPending}
              onClick={() =>
                assigningOrder && assignCardMutation.mutate({ orderId: assigningOrder.id, cardId: cardChoice })
              }
            >
              Assign Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
