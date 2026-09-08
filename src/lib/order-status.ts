// Maps the backend's Order.Status enum (PENDING/CONFIRMED/PROCESSING/
// PRINTED/SHIPPED/DELIVERED/CANCELLED) to a display label shared by every
// page that renders an order status badge.
export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  PRINTED: "Printed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
}

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABEL[status] ?? status
}
