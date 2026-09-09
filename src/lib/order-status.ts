// Maps backend/orders/models.py's Order.Status enum (PENDING/PROCESSING/
// SHIPPED/DELIVERED/COMPLETED/CANCELLED) to a display label shared by every
// page that renders an order status badge.
export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
}

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABEL[status] ?? status
}
