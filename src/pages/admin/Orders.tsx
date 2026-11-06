import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { toast } from "sonner"
import { Search, Download, Eye, CheckCircle2, Circle, MapPin, PackageCheck, Nfc, Truck, Mail } from "lucide-react"
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
import { AccountStatusBadge } from "@/components/admin/AccountStatusBadge"
import { TablePagination } from "@/components/admin/TablePagination"
import { downloadCsv } from "@/components/admin/export-csv"
import { CopyTrackingIdButton } from "@/components/orders/OrderTrackingView"
import { adminOrderApi, adminNfcApi, adminOnboardingApi, ApiError } from "@/lib/api"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/mock-api"
import { usePublicSettings } from "@/hooks/usePublicSettings"
import {
  COURIER_TRANSIT_LABEL,
  PROCESSING_TIME_LABEL,
  deliveredAt,
  deriveCurrentStatus,
  deriveOfficeAddress,
  destinationLine,
  estimateDeliveryWindow,
  officeFullLine,
} from "@/lib/order-tracking"
import { DEMO_COURIER_NAME, SHIPPING_DEMO_DISCLAIMER, getDemoDistanceKm } from "@/lib/shipping-demo"
import type { Order, OrderStatus } from "@/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10
const STATUS_OPTIONS: (OrderStatus | "All")[] = [
  "All",
  "Pending",
  "Processing",
  "Shipped",
  "Out for Delivery",
  "Delivered",
  "Completed",
  "Cancelled",
]

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

function canAssign(order: Order) {
  return order.paymentStatus === "Paid" && order.status !== "Cancelled"
    && (!(order.recipients?.length) || order.recipients.some((recipient) => !recipient.assignedCardId))
}

function cardStatusLabel(value?: string | null) {
  return (value || "UNASSIGNED").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function productSummary(order: Order) {
  const [first, ...rest] = order.items
  if (!first) return "—"
  const extra = rest.reduce((s, i) => s + i.qty, 0)
  return extra > 0 ? `${first.name} +${extra} more` : first.name
}

export default function AdminOrders() {
  const queryClient = useQueryClient()
  const { settings } = usePublicSettings()
  const office = deriveOfficeAddress(settings)

  const [searchParams] = useSearchParams()
  const linkedOrder = searchParams.get("order")
  const linkedOrderId = linkedOrder && /^[1-9][0-9]*$/.test(linkedOrder) ? linkedOrder : null
  const [search, setSearch] = useState(linkedOrderId ?? "")
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "All">("All")
  const [page, setPage] = useState(1)
  // Store just the id and always look the order up live from `orders` below
  // — a frozen local copy of the order would go stale the moment a mutation
  // (status change, card assignment) updates the store, since React Query
  // only patches its own cache, not any snapshot we'd copied out of it.
  const [viewingId, setViewingId] = useState<string | null>(linkedOrderId)
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null)
  const [cardChoice, setCardChoice] = useState<string>("")
  const [recipientChoice, setRecipientChoice] = useState("")
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!linkedOrderId) return
    setSearch(linkedOrderId)
    setPage(1)
    setViewingId(linkedOrderId)
  }, [linkedOrderId])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-orders", page, search, statusFilter],
    queryFn: () => adminOrderApi.list({ page, search: search || undefined, status: statusFilter }),
    placeholderData: keepPreviousData,
  })
  const orders = data?.data ?? []
  const totalItems = data?.count ?? 0
  const totalPages = Math.max(1, data?.numPages ?? 1)

  // Real, currently-unassigned card inventory for the Assign/Reassign dialog
  // — sourced from the actual NFC cards API, not a local mock.
  const { data: unassignedCardsPage, isLoading: inventoryLoading, isError: inventoryError, refetch: refetchInventory } = useQuery({
    queryKey: ["admin-cards-unassigned"],
    queryFn: () => adminNfcApi.list({ status: "Unassigned", pageSize: 100 }),
  })
  const availableCards = unassignedCardsPage?.data ?? []

  const detailOrderId = viewingId ?? assigningOrderId
  const orderDetail = useQuery({
    queryKey: ["admin-order", detailOrderId],
    queryFn: () => adminOrderApi.get(detailOrderId!),
    enabled: Boolean(detailOrderId && !orders.some((order) => order.id === detailOrderId)),
    retry: false,
  })
  const viewing = orders.find((o) => o.id === viewingId) ?? (orderDetail.data?.id === viewingId ? orderDetail.data : null)
  const assigningOrder = orders.find((o) => o.id === assigningOrderId) ?? (orderDetail.data?.id === assigningOrderId ? orderDetail.data : null)
  const unassignedRecipients = assigningOrder?.recipients?.filter((recipient) => !recipient.assignedCardId) ?? []
  const assigningRecipient = unassignedRecipients.find((recipient) => String(recipient.id) === recipientChoice)

  function openAssignment(order: Order, recipientId?: string | number) {
    setAssigningOrderId(order.id)
    setCardChoice("")
    const firstPending = order.recipients?.find((recipient) => !recipient.assignedCardId)
    setRecipientChoice(String(recipientId ?? firstPending?.id ?? ""))
  }
  const trackingStatus = viewing ? deriveCurrentStatus(viewing) : null
  const deliveryWindow = viewing ? estimateDeliveryWindow(viewing) : null
  const estimatedDeliveryText = deliveryWindow
    ? `${formatDate(deliveryWindow.from.toISOString())} – ${formatDate(deliveryWindow.to.toISOString())}`
    : "—"
  const viewingDeliveredOn = viewing ? deliveredAt(viewing) : null
  const viewingDistanceKm = viewing ? getDemoDistanceKm(viewing) : 0
  const viewingOrderNumber = viewing ? (viewing.orderNumber ?? viewing.id) : ""

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
    queryClient.invalidateQueries({ queryKey: ["admin-order"] })
  }

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => adminOrderApi.updateStatus(id, status),
    onSuccess: ({ order, message }, vars) => {
      invalidate()
      toast.success(message || `Order ${order.orderNumber ?? vars.id} marked as ${vars.status}.`)
    },
    // e.g. "This order has no successful payment yet, so it can't move to Processing."
    onError: (err) => toast.error(errorMessage(err, "Couldn't update the order status. Please try again.")),
  })

  const resendActivationMutation = useMutation({
    mutationFn: (onboardingId: number) => adminOnboardingApi.resend(onboardingId),
    onSuccess: () => {
      invalidate()
      toast.success("A new activation link is being emailed to the customer.")
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't resend the activation email.")),
  })

  const deliveredMutation = useMutation({
    mutationFn: (id: string) => adminOrderApi.updateStatus(id, "Delivered"),
    onSuccess: ({ order }, id) => {
      invalidate()
      toast.success(`Order ${order.orderNumber ?? id} marked as Delivered.`)
    },
    onError: () => toast.error("Couldn't update the order status. Please try again."),
  })

  const assignCardMutation = useMutation({
    mutationFn: ({ orderId, cardId, recipientId }: { orderId: string; cardId: string; recipientId?: string }) => adminOrderApi.assignCard(orderId, cardId, recipientId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
      queryClient.invalidateQueries({ queryKey: ["admin-order"] })
      queryClient.invalidateQueries({ queryKey: ["admin-cards"] })
      queryClient.invalidateQueries({ queryKey: ["admin-cards-unassigned"] })
      queryClient.invalidateQueries({ queryKey: ["admin-purchasers"] })
      queryClient.invalidateQueries({ queryKey: ["admin-purchaser"] })
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] })
      toast.success(`Card ${vars.cardId} assigned to order ${vars.orderId}.`)
      setAssigningOrderId(null)
      setCardChoice("")
      setRecipientChoice("")
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't assign the card. Please try again.")),
  })

  async function handleExport() {
    setExporting(true)
    try {
      const rows: Order[] = []
      let currentPage = 1
      let numPages = 1
      do {
        const result = await adminOrderApi.list({
          page: currentPage,
          search: search || undefined,
          status: statusFilter,
        })
        rows.push(...result.data)
        numPages = result.numPages
        currentPage += 1
      } while (currentPage <= numPages)

      downloadCsv(
        `orders-${new Date().toISOString().slice(0, 10)}.csv`,
        rows.map((o) => ({
          OrderID: o.orderNumber ?? o.id,
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
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not export orders.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">{totalItems} orders placed</p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          <Download /> {exporting ? "Exporting..." : "Export"}
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by order ID or purchaser..."
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
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {errorMessage(error, "Unable to load order details.")}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Purchaser</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Cards</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Shipping</TableHead>
                    <TableHead>Current Status</TableHead>
                    <TableHead>Estimated Delivery</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => {
                    const rowStatus = deriveCurrentStatus(o)
                    const rowWindow = estimateDeliveryWindow(o)
                    return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs font-medium">{o.orderNumber ?? o.id}</TableCell>
                      <TableCell>{o.customerName}</TableCell>
                      <TableCell className="text-muted-foreground">{o.customerPhone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{o.customerEmail}</TableCell>
                      <TableCell>{productSummary(o)}</TableCell>
                      <TableCell><button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => setViewingId(o.id)} aria-label={`View recipients for ${o.items.reduce((sum, item) => sum + item.qty, 0)} cards in order ${o.orderNumber ?? o.id}`}>{o.items.reduce((sum, item) => sum + item.qty, 0)}</button></TableCell>
                      <TableCell>{formatCurrency(o.total)}</TableCell>
                      <TableCell>
                        <p className="whitespace-nowrap text-xs text-muted-foreground">{o.paymentMethod}</p>
                        <StatusBadge status={o.paymentStatusLabel ?? o.paymentStatus} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {o.shipping === 0 ? "Free" : formatCurrency(o.shipping)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={rowStatus.label} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {rowWindow
                          ? `${formatDate(rowWindow.from.toISOString())} – ${formatDate(rowWindow.to.toISOString())}`
                          : "—"}
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
                            onClick={() => openAssignment(o)}
                            disabled={!canAssign(o)}
                          >
                            <Nfc /> {!o.recipients?.length && o.assignedCardId ? "Reassign" : "Assign Card"}
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
                    )
                  })}
                  {orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="py-14 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <Truck className="size-5" />
                          </span>
                          <p className="font-medium text-foreground">No orders found</p>
                          <p className="text-sm text-muted-foreground">
                            Customer orders will appear here once they are placed.
                          </p>
                        </div>
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
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
          />
        </CardContent>
      </Card>

      <Sheet open={!!viewingId} onOpenChange={(open) => !open && setViewingId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {!viewing && orderDetail.isLoading && <div className="space-y-4 px-4 py-8"><SheetHeader><SheetTitle>Order Details</SheetTitle><SheetDescription>Loading order and recipient details.</SheetDescription></SheetHeader><Skeleton className="h-64 w-full" /></div>}
          {!viewing && orderDetail.isError && <div className="space-y-3 px-4 py-12"><SheetHeader><SheetTitle>Unable to load order</SheetTitle><SheetDescription>Retry to retrieve this order.</SheetDescription></SheetHeader><p role="alert" className="text-sm text-muted-foreground">{errorMessage(orderDetail.error, "This order could not be loaded.")}</p><Button variant="outline" onClick={() => orderDetail.refetch()}>Retry</Button></div>}
          {viewing && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between gap-2">
                  <SheetTitle>Order {viewingOrderNumber}</SheetTitle>
                  <CopyTrackingIdButton trackingId={viewingOrderNumber} label="Copy Order ID" />
                </div>
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

                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Physical Card Assignment</span>
                    <Button variant="outline" size="sm" disabled={!canAssign(viewing)} onClick={() => openAssignment(viewing)}>
                      <Nfc /> Assign Card
                    </Button>
                  </div>
                  {viewing.recipients?.length ? (
                    <p className="text-xs text-muted-foreground">
                      Purchased: {viewing.items.reduce((sum, item) => sum + item.qty, 0)} | Assigned: {viewing.recipients.filter((recipient) => recipient.assignedCardId).length} | Activated: {viewing.recipients.filter((recipient) => recipient.assignedCardStatus === "ACTIVE").length}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">{viewing.assignedCardId ? `Assigned card ID: ${viewing.assignedCardId}` : "Awaiting physical card assignment"}</p>
                  )}
                  {viewing.paymentStatus !== "Paid" && <p className="text-xs text-muted-foreground">Payment must be confirmed before physical cards can be assigned.</p>}
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
                    <StatusBadge status={viewing.paymentStatusLabel ?? viewing.paymentStatus} />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Delivery Details</p>
                  {viewing.delivery ? (
                    <div className="space-y-0.5 rounded-lg border p-3 text-sm">
                      <p className="font-medium text-foreground">
                        {viewing.delivery.fullName} · {viewing.delivery.phone}
                      </p>
                      <p className="text-muted-foreground">{viewing.delivery.email}</p>
                      {[
                        viewing.delivery.addressLine1,
                        viewing.delivery.addressLine2,
                        viewing.delivery.landmark && `Landmark: ${viewing.delivery.landmark}`,
                        viewing.delivery.locality,
                        [viewing.delivery.city, viewing.delivery.district && `Dist. ${viewing.delivery.district}`]
                          .filter(Boolean)
                          .join(", "),
                        `${viewing.delivery.state} - ${viewing.delivery.pincode}, ${viewing.delivery.country}`,
                      ]
                        .filter(Boolean)
                        .map((line, i) => (
                          <p key={i} className="text-muted-foreground">
                            {line}
                          </p>
                        ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                      {viewing.address.line1}, {viewing.address.city}, {viewing.address.state}{" "}
                      {viewing.address.pincode}, {viewing.address.country}
                    </p>
                  )}
                </div>

                {viewing.account && (
                  <div>
                    <p className="mb-2 text-sm font-medium">Purchaser Account</p>
                    <div className="space-y-2 rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <AccountStatusBadge status={viewing.account.status} />
                        {viewing.account.onboardingId !== null &&
                          (viewing.account.status === "EMAIL_SENT" || viewing.account.status === "EMAIL_FAILED") && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={resendActivationMutation.isPending}
                              onClick={() => resendActivationMutation.mutate(viewing.account!.onboardingId!)}
                            >
                              <Mail className="size-3.5" /> Resend Activation Email
                            </Button>
                          )}
                      </div>
                      {viewing.account.status === "PENDING_PROCESSING" && (
                        <p className="text-xs text-muted-foreground">
                          Moving this paid order to Processing emails the purchaser a secure link to set their password and access order history. Recipient account setup is listed separately.
                        </p>
                      )}
                      {viewing.account.status === "EMAIL_FAILED" && (
                        <p className="text-xs text-destructive">
                          Email delivery failed after {viewing.account.emailAttempts ?? 0} attempts
                          {viewing.account.emailLastError ? ` (${viewing.account.emailLastError})` : ""}. Use Resend
                          once email is working.
                        </p>
                      )}
                      {viewing.account.status === "EMAIL_SENT" && viewing.account.emailSentAt && (
                        <p className="text-xs text-muted-foreground">Sent {formatDateTime(viewing.account.emailSentAt)}</p>
                      )}
                      {viewing.account.status === "ACTIVATED" && (
                        <p className="text-xs text-muted-foreground">
                          {viewing.account.createdFromOrder
                            ? `Password set${viewing.account.passwordSetAt ? ` ${formatDateTime(viewing.account.passwordSetAt)}` : ""}.`
                            : "Existing customer account — no activation needed."}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {viewing.recipients && viewing.recipients.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium">Recipients ({viewing.recipients.length})</p>
                    <div className="space-y-3 rounded-lg border p-3 text-sm">
                      {viewing.recipients.map((recipient, index) => {
                        const recipientStatus = recipient.accountStatus ?? "PENDING_PROCESSING"
                        const canResend =
                          recipient.onboardingId != null &&
                          (recipient.invitationStatus === "Sent" || recipient.invitationStatus === "Failed")

                        return (
                          <div key={recipient.id} className="rounded-md border bg-background/60 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs text-muted-foreground">Card {index + 1}</p>
                                <p className="font-medium text-foreground">{recipient.name}</p>
                                <p className="break-all text-muted-foreground">{recipient.email}</p>
                                <p className="text-muted-foreground">{recipient.phone || "Phone not recorded"}</p>
                              </div>
                              {canResend && recipient.onboardingId !== null && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={resendActivationMutation.isPending}
                                  onClick={() => resendActivationMutation.mutate(recipient.onboardingId!)}
                                >
                                  <Mail className="size-3.5" /> Resend
                                </Button>
                              )}
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">Account</span>
                                <AccountStatusBadge status={recipientStatus} />
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">Account invitation</span>
                                <StatusBadge status={recipient.invitationStatus ?? "Pending"} />
                              </div>
                            </div>
                            <div className="mt-3 space-y-2 border-t pt-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">Physical card</span>
                                <StatusBadge status={cardStatusLabel(recipient.assignedCardStatus)} />
                              </div>
                              {recipient.assignedCardId ? (
                                <div className="space-y-1 text-xs text-muted-foreground">
                                  <p>Serial: <span className="break-all font-mono">{recipient.assignedCardSerial || "Not recorded"}</span></p>
                                  <p>UID: <span className="break-all font-mono">{recipient.assignedCardUid || "Not recorded"}</span></p>
                                  <p>Card activation: {cardStatusLabel(recipient.activationStatus || "PENDING")}</p>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs text-muted-foreground">Awaiting physical card assignment</p>
                                  <Button variant="outline" size="sm" disabled={!canAssign(viewing)} onClick={() => openAssignment(viewing, recipient.id)}><Nfc /> Assign</Button>
                                </div>
                              )}
                              {recipient.profileUsername ? <a className="text-xs font-medium text-primary hover:underline" href={`/u/${encodeURIComponent(recipient.profileUsername)}`} target="_blank" rel="noreferrer">View digital profile</a> : <p className="text-xs text-muted-foreground">Profile pending</p>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <Separator />

                <div>
                  <p className="mb-3 text-sm font-semibold">Delivery & Tracking</p>

                  {/* Prominent current-status card */}
                  {trackingStatus?.kind === "delivered" ? (
                    <div className="rounded-lg border border-success/30 bg-success/10 p-4">
                      <p className="flex items-center gap-2 text-base font-bold text-success">
                        <CheckCircle2 className="size-5" /> DELIVERED
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Delivered on{" "}
                        <span className="font-semibold text-foreground">
                          {viewingDeliveredOn ? formatDateTime(viewingDeliveredOn) : "—"}
                        </span>
                      </p>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "rounded-lg border p-4",
                        trackingStatus?.kind === "cancelled"
                          ? "border-destructive/30 bg-destructive/5"
                          : "border-border bg-gradient-to-br from-primary/5 via-transparent to-transparent",
                      )}
                    >
                      <p className="text-xs font-medium text-muted-foreground">Current Status</p>
                      <p
                        className={cn(
                          "mt-1 flex items-center gap-2 text-base font-bold",
                          trackingStatus?.kind === "cancelled" ? "text-destructive" : "text-primary",
                        )}
                      >
                        <Truck className="size-4" /> {trackingStatus?.label}
                      </p>
                      {trackingStatus?.kind !== "cancelled" && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Estimated Delivery: <span className="font-medium text-foreground">{estimatedDeliveryText}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Delivery overview */}
                  <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Delivery Overview
                  </p>
                  <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">From</p>
                      <p className="font-medium">{officeFullLine(office) || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">To</p>
                      <p className="font-medium">{destinationLine(viewing) || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Distance</p>
                      <p className="font-medium">{viewingDistanceKm} km</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Shipping Charge</p>
                      <p className="font-medium">
                        {viewing.shipping === 0 ? "Free" : formatCurrency(viewing.shipping)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Processing Time</p>
                      <p className="font-medium">{PROCESSING_TIME_LABEL}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Courier Transit</p>
                      <p className="font-medium">{COURIER_TRANSIT_LABEL}</p>
                    </div>
                  </div>

                  {/* Simple CSS-only route visual — no maps/geocoding API */}
                  <div className="mt-3 flex flex-col items-center gap-1 rounded-lg border bg-muted/30 p-4 text-center">
                    <MapPin className="size-4 text-primary" />
                    <p className="text-xs font-medium">{office.name || "—"}</p>
                    <span className="h-3 w-px bg-border" />
                    <Truck className="size-4 text-primary" />
                    <span className="h-3 w-px bg-border" />
                    <MapPin className="size-4 text-primary" />
                    <p className="text-xs font-medium">{destinationLine(viewing) || "—"}</p>
                  </div>

                  {/* Shipment / tracking information */}
                  <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Shipment Information
                  </p>
                  <div className="rounded-lg border p-3">
                    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Courier</p>
                        <p className="font-medium">{DEMO_COURIER_NAME}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <p className="font-medium">{trackingStatus?.label}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{SHIPPING_DEMO_DISCLAIMER}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Order Timeline</p>
                  <div className="flex flex-col gap-3">
                    {viewing.tracking.map((step, idx) => {
                      const isCurrent = idx === trackingStatus?.index && trackingStatus?.kind === "in-progress"
                      return (
                        <div key={idx} className="flex items-start gap-3">
                          {step.done ? (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                          ) : (
                            <Circle
                              className={cn(
                                "mt-0.5 size-4 shrink-0",
                                isCurrent ? "text-primary" : "text-muted-foreground",
                              )}
                            />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <p className={cn("text-sm", step.done || isCurrent ? "font-medium" : "text-muted-foreground")}>
                                {step.label}
                              </p>
                              {isCurrent && (
                                <span className="rounded-full bg-gradient-brand px-2 py-0.5 text-[10px] font-semibold text-white">
                                  Current
                                </span>
                              )}
                            </div>
                            {step.date && (
                              <p className="text-xs text-muted-foreground">{formatDateTime(step.date)}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
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
              Assign an available physical card to a recipient of order {assigningOrder?.orderNumber ?? assigningOrder?.id}. The card appears in that recipient's account ready to activate.
            </DialogDescription>
          </DialogHeader>
          {Boolean(assigningOrder?.recipients?.length) && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Recipient allocation</p>
              <Select value={recipientChoice} onValueChange={setRecipientChoice}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select an unassigned recipient" /></SelectTrigger>
                <SelectContent>
                  {unassignedRecipients.map((recipient) => <SelectItem key={recipient.id} value={String(recipient.id)}>{recipient.name} - {recipient.email}</SelectItem>)}
                </SelectContent>
              </Select>
              {assigningRecipient && <p className="break-all text-xs text-muted-foreground">{assigningRecipient.email} | {assigningRecipient.phone || "Phone not recorded"}</p>}
              {unassignedRecipients.length === 0 && <p className="text-sm text-muted-foreground">Every recipient already has a physical card.</p>}
            </div>
          )}
          {inventoryLoading && <Skeleton className="h-10 w-full" />}
          {inventoryError && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">Unable to load available cards.</p><Button variant="outline" size="sm" onClick={() => refetchInventory()}>Retry inventory</Button></div>}
          <Select value={cardChoice} onValueChange={setCardChoice} disabled={inventoryLoading || inventoryError || assignCardMutation.isPending}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an unassigned card" />
            </SelectTrigger>
            <SelectContent>
              {availableCards.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.id} · {c.uid} ({c.cardType})
                </SelectItem>
              ))}
              {availableCards.length === 0 && (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">No unassigned cards in stock.</div>
              )}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigningOrderId(null)}>
              Cancel
            </Button>
            <Button
              disabled={!cardChoice || assignCardMutation.isPending || !assigningOrder || !canAssign(assigningOrder) || Boolean(assigningOrder.recipients?.length && !assigningRecipient)}
              onClick={() =>
                assigningOrder && assignCardMutation.mutate({ orderId: assigningOrder.id, cardId: cardChoice, recipientId: assigningRecipient ? String(assigningRecipient.id) : undefined })
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
