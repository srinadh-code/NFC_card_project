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
