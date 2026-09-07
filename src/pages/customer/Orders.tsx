import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2, Circle, Download, LifeBuoy, PackageSearch } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCustomerAuthStore } from "@/store/auth-store"
import { useDataStore } from "@/store/data-store"
import { customerOrderApi } from "@/lib/api"
import { formatCurrency, formatDate } from "@/lib/mock-api"
import type { Order, OrderStatus } from "@/types"

const STATUS_VARIANT: Record<OrderStatus, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  Pending: "warning",
  Processing: "secondary",
  Shipped: "default",
  Delivered: "success",
  Completed: "success",
  Cancelled: "destructive",
}

function productSummary(order: Order) {
  const [first, ...rest] = order.items
  if (!first) return "—"
  const extra = rest.reduce((s, i) => s + i.qty, 0)
  return extra > 0 ? `${first.name} ×${first.qty} +${extra} more` : `${first.name} ×${first.qty}`
}

function downloadInvoice(order: Order) {
  const lines = [
    `VR's NEXORA — Invoice for ${order.id}`,
    `Date: ${formatDate(order.date)}`,
    `Customer: ${order.customerName} (${order.customerEmail})`,
    `Payment: ${order.paymentMethod} — ${order.paymentStatus}`,
    "",
    "Items:",
    ...order.items.map((it) => `  - ${it.name} (${it.cardType}, ${it.color}) x${it.qty} @ ${formatCurrency(it.price)}`),
    "",
    `Subtotal: ${formatCurrency(order.amount)}`,
    `Shipping: ${formatCurrency(order.shipping)}`,
    `Total: ${formatCurrency(order.total)}`,
    "",
    `Shipping Address: ${order.address.line1}, ${order.address.city}, ${order.address.state} ${order.address.pincode}, ${order.address.country}`,
  ]
  const blob = new Blob([lines.join("\n")], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `invoice-${order.id}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast.success("Invoice downloaded.")
}

export default function CustomerOrders() {
  const customer = useCustomerAuthStore((s) => s.customer)
  // No customer-facing support-ticket API exists yet (admin_api/support is
  // admin-only) — the "Contact Support" dialog below still logs into the
  // local mock ticket store until that endpoint exists.
  const addTicket = useDataStore((s) => s.addTicket)

  const { data, isLoading } = useQuery({
    queryKey: ["customer-orders", customer?.id],
    queryFn: async () => (await customerOrderApi.mine()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    enabled: Boolean(customer?.id),
  })

  const [trackOrder, setTrackOrder] = useState<Order | null>(null)
  const [supportOpen, setSupportOpen] = useState(false)
  const [subject, setSubject] = useState("")
  const [description, setDescription] = useState("")

  function handleSubmitTicket() {
    if (!customer || !subject.trim() || !description.trim()) {
      toast.error("Please fill in both subject and description.")
      return
    }
    const now = new Date().toISOString()
    addTicket({
      customerId: customer.id,
      customerName: customer.name,
      subject: subject.trim(),
      description: description.trim(),
      priority: "Medium",
      status: "Open",
      createdOn: now,
      updatedOn: now,
      messages: [{ from: "customer", text: description.trim(), date: now }],
    })
    toast.success("Support ticket submitted. Our team will get back to you soon.")
    setSubject("")
    setDescription("")
    setSupportOpen(false)
  }

  if (!customer) return null

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
          {isLoading || !data ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <PackageSearch className="size-10 text-muted-foreground" />
              <p className="font-medium">You haven&apos;t placed any orders yet.</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Need Help?{" "}
                <button onClick={() => setSupportOpen(true)} className="font-medium text-primary hover:underline">
                  Contact Support
                </button>
              </p>
            </div>
          ) : (
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
                {data.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs font-medium">{order.id}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(order.date)}</TableCell>
                    <TableCell>{productSummary(order)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(order.total)}</TableCell>
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
          )}
        </CardContent>
      </Card>

      {data && data.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Need help with an order?{" "}
          <button onClick={() => setSupportOpen(true)} className="font-medium text-primary hover:underline">
            Contact Support
          </button>
        </p>
      )}

      {/* Track order dialog */}
      <Dialog open={Boolean(trackOrder)} onOpenChange={(open) => !open && setTrackOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Track Order {trackOrder?.id}</DialogTitle>
            <DialogDescription>Live status of your shipment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {trackOrder?.tracking.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  {step.done ? (
                    <CheckCircle2 className="size-5 text-success" />
                  ) : (
                    <Circle className="size-5 text-muted-foreground" />
                  )}
                  {trackOrder && i < trackOrder.tracking.length - 1 && (
                    <div className={`mt-1 h-8 w-px ${step.done ? "bg-success" : "bg-border"}`} />
                  )}
                </div>
                <div className="pb-2">
                  <p className={`text-sm font-medium ${step.done ? "" : "text-muted-foreground"}`}>{step.label}</p>
                  {step.date && <p className="text-xs text-muted-foreground">{formatDate(step.date)}</p>}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Contact support dialog */}
      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LifeBuoy className="size-4 text-primary" /> Contact Support
            </DialogTitle>
            <DialogDescription>Tell us what's going on and we'll get back to you.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ticket-subject">Subject</Label>
              <Input id="ticket-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Order not delivered" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ticket-description">Description</Label>
              <Textarea
                id="ticket-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your issue in detail..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitTicket}>Submit Ticket</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
