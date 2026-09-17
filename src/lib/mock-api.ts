// Small helper to simulate real network latency around our in-memory /
// localStorage-backed zustand stores, so React Query hooks built on top of
// them behave like they would against a real Django REST backend later
// (loading states, refetch, optimistic updates, cache invalidation, etc.)
export function simulateLatency<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

// `currency` defaults to INR so every existing (admin/customer-portal) call
// site keeps behaving exactly as before — only the public site's price
// displays pass the live Admin Settings > General currency explicitly (see
// usePublicSettings()). Locale stays "en-IN" regardless of currency: mapping
// each currency to its own locale is out of scope here.
export function formatCurrency(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

// `timeZone` is optional so existing call sites keep rendering in the
// browser's local time unchanged — only public pages that read
// usePublicSettings() pass the configured site timezone explicitly.
export function formatDate(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  })
}

// The backend has no separate customer-facing order-number field — the
// real Order's own database id is the identifier (see orders/models.py) —
// so this only formats that same id for display/URLs ("ORD000013"), it
// never invents a second identifier. Matches
// orders/serializers.py's PublicOrderTrackingSerializer.get_order_number()
// exactly, so a value formatted here always round-trips through
// ordersApi.trackPublic() (which also accepts the bare numeric id).
export function formatOrderNumber(id: number | string): string {
  const numeric = typeof id === "number" ? id : parseInt(id.replace(/\D/g, ""), 10)
  return Number.isFinite(numeric) ? `ORD${String(numeric).padStart(6, "0")}` : String(id)
}

export function formatDateTime(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  })
}

// "10 minutes ago" / "2 hours ago" / "Yesterday" style relative timestamp —
// for short-lived UI like the notification dropdown, where the exact date
// matters less than roughly how recent something is. Falls back to
// formatDate() once an item is old enough that "N days ago" stops being
// more useful than just the date.
export function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  return formatDate(iso)
}
