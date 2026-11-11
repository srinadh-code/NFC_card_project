import { OrderRecipientsTable } from "@/components/admin/OrderRecipientsTable"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { formatCurrency, formatDate } from "@/lib/mock-api"
import type { Order } from "@/types"

export function OrderDetailsView({ order }: { order: Order }) {
  const quantity = order.items.reduce((sum, item) => sum + item.qty, 0)

  return (
    <div className="min-w-0 space-y-6">
      <dl className="grid grid-cols-2 gap-4 rounded-xl border p-4 text-sm sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Order ID</dt>
          <dd className="break-words font-mono font-semibold">{order.orderNumber ?? order.id}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Purchase Date</dt>
          <dd className="font-medium">{formatDate(order.date)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Card Quantity</dt>
          <dd className="font-medium">{quantity}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Total Amount</dt>
          <dd className="font-medium">{formatCurrency(order.total)}</dd>
        </div>
        <div>
          <dt className="mb-1 text-xs text-muted-foreground">Payment Status</dt>
          <dd><StatusBadge status={order.paymentStatusLabel ?? order.paymentStatus} /></dd>
        </div>
        <div>
          <dt className="mb-1 text-xs text-muted-foreground">Order Status</dt>
          <dd><StatusBadge status={order.status} /></dd>
        </div>
      </dl>

      <div className="space-y-1 rounded-xl border p-4 text-sm">
        <h3 className="font-semibold">Purchaser</h3>
        <p>{order.customerName || "Name not recorded"}</p>
        <p className="break-all text-muted-foreground">{order.customerEmail || "Email not recorded"}</p>
        <p className="text-muted-foreground">{order.customerPhone || "Phone not recorded"}</p>
      </div>

      <section className="min-w-0 space-y-3" aria-label="Order recipients">
        <h3 className="font-semibold">Recipients</h3>
        <OrderRecipientsTable recipients={order.recipients ?? []} showAdminDetails={false} />
      </section>
    </div>
  )
}
