import { Navigate, Outlet, useLocation } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuthStore, hasValidSession } from "@/store/auth-store"

/**
 * Single source of truth for gating a route subtree behind a role. Used for
 * both the customer portal (/dashboard, /orders, /my-card, /profile,
 * /social-links, /analytics, /activity, /settings) and the admin portal
 * (/admin/*), plus one-off protected pages nested inside the public layout
 * (/checkout).
 *
 * Two things it does that an ad hoc `if (!customer) return <Navigate/>` in
 * each page does not:
 *  1. Waits for `hydrated` (the one-time server round-trip in
 *     auth-store.ts's bootstrap()) before deciding anything, so a page
 *     never briefly renders real protected content off a stale/cached
 *     session before that session has actually been re-validated.
 *  2. Requires an actual access token via hasValidSession(), not just a
 *     cached `user` role — closing the gap where a leftover persisted
 *     Zustand user (tokens cleared/expired independently) used to be
 *     enough to pass every guard in the app.
 */
export function ProtectedRoute({ role }: { role: "ADMIN" | "CUSTOMER" }) {
  const user = useAuthStore((s) => s.user)
  const hydrated = useAuthStore((s) => s.hydrated)
  const location = useLocation()

  const authorized = hasValidSession(user, role)

  if (import.meta.env.DEV) {
    // Temporary, dev-only — traces exactly why a route guard let someone
    // through or bounced them, per the auth audit that introduced this file.
    // eslint-disable-next-line no-console
    console.debug("[ProtectedRoute]", {
      path: location.pathname,
      requiredRole: role,
      hydrated,
      cachedUserRole: user?.role ?? null,
      authorized,
    })
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!authorized) {
    const loginPath = role === "ADMIN" ? "/admin/login" : "/login"
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`${loginPath}?redirect=${redirect}`} replace />
  }

  return <Outlet />
}
