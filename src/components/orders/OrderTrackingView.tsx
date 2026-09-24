import { CheckCircle2, Circle, Copy, Headset, MapPin, Package, RefreshCw, Truck, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { buildMailtoHref, cn } from "@/lib/utils"
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
  officeShortLine,
} from "@/lib/order-tracking"
import { DEMO_COURIER_NAME, SHIPPING_DEMO_DISCLAIMER, getDemoDistanceKm } from "@/lib/shipping-demo"
import type { Order } from "@/types"

/**
 * The one shared "here's exactly where your order is" experience — reused
 * as-is by the customer Orders page's Track dialog and the public Track
 * Order page's search result, and referenced (for its derived-fields
 * helpers only) by the Admin order detail view. Operates purely on the
 * existing `Order` shape: real data end to end for anything the backend
 * actually tracks (status, tracking steps, items, amounts, address,
 * order_number). A route distance/named courier are still never fabricated
 * as anything but a clearly-labeled demo estimate — see
 * lib/shipping-demo.ts's module comment.
 */
export function OrderTrackingView({
  order,
  onRefresh,
  isRefreshing,
  onViewDetails,
  showShippingDetails = true,
}: {
  order: Order
  onRefresh?: () => void
  isRefreshing?: boolean
  onViewDetails?: () => void
  /** The customer-facing tracking modal (Customer Orders' Track Order
   * dialog) deliberately omits the Delivery Route visual and the
   * Shipping Information card (distance/shipping charge/processing time/
   * courier transit) — those stay on the public Track Order page and
   * Admin Order Details. Defaults to true (unchanged) for every existing
   * caller except the customer Orders page. */
  showShippingDetails?: boolean
}) {
  const { settings } = usePublicSettings()
  const supportEmail = settings.support_email || settings.site_email
  const office = deriveOfficeAddress(settings)
  const current = deriveCurrentStatus(order)
  const deliveryWindow = estimateDeliveryWindow(order)
  const estimatedDeliveryText = deliveryWindow
    ? `${formatDate(deliveryWindow.from.toISOString())} – ${formatDate(deliveryWindow.to.toISOString())}`
    : "—"
  const deliveredOn = deliveredAt(order)
  const distanceKm = getDemoDistanceKm(order)
  // The real public order code (see Order.generate_order_number on the
  // backend) — falls back to the internal id only for an order object that
  // somehow predates that field (never happens from a live API response).
  const orderNumber = order.orderNumber ?? order.id

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      {current.kind === "delivered" ? (
        <div className="rounded-2xl border border-success/30 bg-success/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Order #{orderNumber}</p>
            <CopyTrackingIdButton trackingId={orderNumber} label="Copy Order ID" />
          </div>
          <p className="text-sm text-muted-foreground">
            {order.customerName} • Placed {formatDate(order.date)}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xl font-bold text-success">
            <CheckCircle2 className="size-6" /> DELIVERED
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Delivered on{" "}
            <span className="font-semibold text-foreground">
              {deliveredOn ? formatDateTime(deliveredOn) : "—"}
            </span>
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "rounded-2xl border p-5",
            current.kind === "cancelled"
              ? "border-destructive/30 bg-destructive/5"
              : "border-border bg-gradient-to-br from-primary/5 via-transparent to-transparent",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Order</p>
              <p className="font-mono text-lg font-bold text-foreground">#{orderNumber}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {order.customerName} • Placed {formatDate(order.date)}
              </p>
              <div className="mt-1.5">
                <CopyTrackingIdButton trackingId={orderNumber} label="Copy Order ID" />
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-muted-foreground">Current Status</p>
              <p
                className={cn(
                  "mt-0.5 flex items-center justify-end gap-1.5 text-base font-bold",
                  current.kind === "cancelled" ? "text-destructive" : "text-primary",
                )}
              >
                {current.kind === "cancelled" ? (
                  <XCircle className="size-4" />
                ) : (
                  <span className="relative flex size-2.5">
                    <span
                      className={cn(
                        "absolute inline-flex size-full rounded-full opacity-75",
                        current.kind === "in-progress" && "animate-ping bg-primary",
                      )}
                    />
                    <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                  </span>
                )}
                {current.label}
              </p>
            </div>
          </div>
          {current.kind !== "cancelled" && (
            <p className="mt-3 text-sm text-muted-foreground">
              Estimated Delivery: <span className="font-medium text-foreground">{estimatedDeliveryText}</span>
            </p>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard icon={Package} label="Order Status" value={current.label} />
        <SummaryCard icon={Truck} label="Estimated" value={deliveryWindow ? estimatedDeliveryText : "—"} />
        <SummaryCard icon={MapPin} label="Destination" value={destinationLine(order) || "—"} />
        <SummaryCard icon={Package} label="Payment" value={order.paymentStatus} />
      </div>

      {/* Timeline */}
      {current.kind !== "cancelled" ? (
        <div>
          <p className="mb-3 text-sm font-semibold text-foreground">Tracking Timeline</p>
          <ol className="flex flex-col">
            {order.tracking.map((step, i) => {
              const isCurrent = i === current.index && current.kind === "in-progress"
              const isLast = i === order.tracking.length - 1
              return (
                <li key={step.label} className="relative flex gap-3 pb-6 last:pb-0">
                  {!isLast && (
                    <span
                      className={cn(
                        "absolute left-[11px] top-6 h-full w-px",
                        step.done ? "bg-primary" : "bg-border",
                      )}
                    />
                  )}
                  {step.done ? (
                    <CheckCircle2 className="size-[22px] shrink-0 text-primary" />
                  ) : isCurrent ? (
                    <span className="relative flex size-[22px] shrink-0 items-center justify-center">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40" />
                      <Circle className="relative size-[22px] fill-primary/15 text-primary" />
                    </span>
                  ) : (
                    <Circle className="size-[22px] shrink-0 text-muted-foreground/30" />
                  )}
                  <div className="flex-1 pt-0.5">
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          step.done || isCurrent ? "text-foreground" : "text-muted-foreground/70",
                        )}
                      >
                        {step.label}
                      </p>
                      {isCurrent && (
                        <span className="rounded-full bg-gradient-brand px-2 py-0.5 text-[10px] font-semibold text-white">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {step.date ? formatDateTime(step.date) : isCurrent ? "In progress" : "Pending"}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      ) : (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          This order was cancelled. If you believe this is a mistake, please contact support.
        </div>
      )}

      {showShippingDetails && (
        <>
          {/* Delivery route */}
          <div className="rounded-2xl border border-border bg-muted/30 p-5">
            <p className="mb-4 text-sm font-semibold text-foreground">Delivery Route</p>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MapPin className="size-4" />
              </span>
              <p className="text-sm font-medium text-foreground">{office.name || "—"}</p>
              <p className="text-xs text-muted-foreground">{officeShortLine(office) || "—"}</p>
              <div className="flex flex-col items-center py-1 text-muted-foreground/40">
                <span className="h-4 w-px bg-border" />
                <Truck className="my-1 size-4 text-primary" />
                <span className="h-4 w-px bg-border" />
              </div>
              <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MapPin className="size-4" />
              </span>
              <p className="text-sm font-medium text-foreground">Delivery Address</p>
              <p className="text-xs text-muted-foreground">{destinationLine(order) || "—"}</p>
            </div>
          </div>

          {/* Shipping information */}
          <div className="rounded-2xl border border-border p-5">
            <p className="mb-4 text-sm font-semibold text-foreground">Shipping Information</p>
            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <InfoRow label="From" value={officeFullLine(office) || "—"} />
              <InfoRow
                label="To"
                value={
                  [
                    order.address.line1,
                    [order.address.city, order.address.state].filter(Boolean).join(", "),
                    order.address.pincode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"
                }
              />
              <InfoRow label="Distance" value={`${distanceKm} km`} />
              <InfoRow
                label="Shipping Charge"
                value={order.shipping === 0 ? "Free" : formatCurrency(order.shipping)}
              />
              <InfoRow label="Processing Time" value={PROCESSING_TIME_LABEL} />
              <InfoRow label="Courier Transit" value={COURIER_TRANSIT_LABEL} />
              <InfoRow label="Estimated Delivery" value={estimatedDeliveryText} />
            </div>
          </div>
        </>
      )}

      {/* Tracking information — the Order ID itself (order.orderNumber) is
          already shown at the top; this card is only what's additional:
          the (still-demo, no real courier integration yet) courier name
          and the current status. */}
      <div className="rounded-2xl border border-border p-5">
        <p className="mb-4 text-sm font-semibold text-foreground">Tracking Information</p>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <InfoRow label="Courier" value={DEMO_COURIER_NAME} />
          <InfoRow label="Status" value={current.label} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{SHIPPING_DEMO_DISCLAIMER}</p>
      </div>

      {/* Order items */}
      <div className="rounded-2xl border border-border p-5">
        <p className="mb-3 text-sm font-semibold text-foreground">Order Items</p>
        <div className="flex flex-col gap-2">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-foreground">
                {item.name} <span className="text-muted-foreground">({item.color})</span> &times; {item.qty}
              </span>
              <span className="font-medium text-foreground">{formatCurrency(item.price * item.qty)}</span>
            </div>
          ))}
          <Separator className="my-1" />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Shipping</span>
            <span>{order.shipping === 0 ? "Free" : formatCurrency(order.shipping)}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-semibold text-foreground">
            <span>Total</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
            {isRefreshing ? "Refreshing..." : "Refresh Tracking"}
          </Button>
        )}
        {onViewDetails && (
          <Button variant="outline" size="sm" onClick={onViewDetails}>
            View Order Details
          </Button>
        )}
        {supportEmail && (
          <Button variant="outline" size="sm" asChild>
            <a href={buildMailtoHref(supportEmail)}>
              <Headset className="size-3.5" /> Contact Support
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-foreground" title={value}>
        {value}
      </p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  )
}

/** Small standalone "Copy ID" button — defaults to "Copy Tracking ID" for
 * any future real courier tracking number, but is reused here with
 * label="Copy Order ID" for the order's own real order_number. */
export function CopyTrackingIdButton({
  trackingId,
  label = "Copy Tracking ID",
}: {
  trackingId: string
  label?: string
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard
          .writeText(trackingId)
          .then(() => toast.success(`${label.replace(/^Copy /, "")} copied`))
          .catch(() => toast.error(`Couldn't copy the ${label.replace(/^Copy /, "").toLowerCase()}.`))
      }}
    >
      <Copy className="size-3.5" /> {label}
    </Button>
  )
}
