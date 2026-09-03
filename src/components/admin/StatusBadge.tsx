import { Badge, type badgeVariants } from "@/components/ui/badge"
import type { VariantProps } from "class-variance-authority"

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"]

// Single lookup covering every status/priority string used across the admin
// portal (customers, cards, orders, payments, profiles, tickets, priority).
const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  Active: "success",
  Assigned: "soft",
  Inactive: "secondary",
  Blocked: "destructive",
  Lost: "destructive",
  Unassigned: "outline",

  Pending: "warning",
  Processing: "soft",
  Shipped: "default",
  Delivered: "success",
  Completed: "success",
  Cancelled: "destructive",

  Paid: "success",
  Refunded: "soft",
  Failed: "destructive",

  Suspended: "destructive",

  Open: "warning",
  "In Progress": "soft",
  Resolved: "success",
  Closed: "secondary",

  High: "destructive",
  Medium: "warning",
  Low: "secondary",
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = STATUS_VARIANTS[status] ?? "outline"
  return (
    <Badge variant={variant} className={className}>
      {status}
    </Badge>
  )
}
