import { useMemo } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { AdminUser, CustomerUser } from "@/types"
import {
  ApiError,
  type ApiUser,
  type SessionArea,
  authApi,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
  setUnauthorizedHandler,
} from "@/lib/api"
import { useCartStore } from "@/store/cart-store"

interface SessionState {
  user: ApiUser | null
  hydrated: boolean
  setUser: (user: ApiUser | null) => void
  bootstrap: () => Promise<void>
}

/**
 * One independent, persisted session per portal (admin/customer) — each
 * backed by its own localStorage token pair (see api.ts's per-`area`
 * getAccessToken/setTokens/clearTokens) and its own persisted Zustand
 * slice. Two portals used to share a single global token pair, which meant
 * logging into the Customer portal in one browser tab would silently
 * overwrite the Admin portal's session in a different tab of the same
 * browser (and vice versa) — the admin tab kept showing its old cached
 * screen, but the next real action sent the *other* portal's token and got
 * a correct, but very confusing, 403. Fully separate keys/stores means
 * either portal can be open in its own tab without the other ever
 * interfering.
 */
function createSessionStore(area: SessionArea, persistName: string) {
  return create<SessionState>()(
    persist(
      (set) => ({
        user: null,
        hydrated: false,
        setUser: (user) => set({ user }),
        bootstrap: async () => {
          const hasToken = Boolean(getAccessToken(area))
          if (import.meta.env.DEV) {
            // Temporary, dev-only — see ProtectedRoute.tsx for the matching
            // route-guard-decision log this pairs with.
            // eslint-disable-next-line no-console
            console.debug(`[auth-store:${area}] bootstrap start`, { hasToken })
          }
          if (!hasToken) {
            // No token — whatever `user` is currently persisted (e.g. left
            // over from a prior session where only the token keys got
            // cleared) is stale and must not be trusted. Clearing it here is
            // what makes every route guard's "is there a real session" check
            // correct instead of trusting cached UI state.
            set({ user: null, hydrated: true })
            return
          }
          try {
            const user = await authApi.me(area)
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.debug(`[auth-store:${area}] bootstrap resolved`, { role: user.role })
            }
            set({ user, hydrated: true })
          } catch {
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.debug(`[auth-store:${area}] bootstrap failed — clearing session`)
            }
            clearTokens(area)
            set({ user: null, hydrated: true })
          }
        },
      }),
      { name: persistName, partialize: (s) => ({ user: s.user }) },
    ),
  )
}

export const useAdminSessionStore = createSessionStore("admin", "nexora-admin-auth")
export const useCustomerSessionStore = createSessionStore("customer", "nexora-customer-auth")

// Any request anywhere in the app that discovers a session is truly
// unrecoverable (401 with an already-expired/invalid refresh token) clears
// the in-memory user for *that* portal only — otherwise a page that made a
// background API call would keep rendering as "logged in" (stale store)
// until a manual logout or full page reload, even though every subsequent
// request would 401.
setUnauthorizedHandler((area) => {
  const store = area === "admin" ? useAdminSessionStore : useCustomerSessionStore
  store.getState().setUser(null)
})

/**
 * The single source of truth for "is this browser really authenticated as
 * `role`" for a given portal's store. Checking `user?.role` alone isn't
 * enough — the persisted Zustand `user` blob can outlive the actual JWTs
 * (tokens cleared/expired independently of the store, e.g. via devtools or
 * an untouched-since-login localStorage). Every route guard and facade
 * must go through this so cached UI state can never stand in for a real,
 * currently-present token.
 */
export function hasValidSession(user: ApiUser | null, role: "ADMIN" | "CUSTOMER"): boolean {
  const area: SessionArea = role === "ADMIN" ? "admin" : "customer"
  return Boolean(user) && user!.role === role && Boolean(getAccessToken(area))
}

function toCustomerUser(u: ApiUser): CustomerUser {
  return { id: String(u.id), name: u.full_name, email: u.email, avatar: u.avatar }
}

function toAdminUser(u: ApiUser): AdminUser {
  return { name: u.full_name || "Admin", email: u.email, role: "Super Admin", avatar: u.avatar }
}

function doLogout(area: SessionArea) {
  const store = area === "admin" ? useAdminSessionStore : useCustomerSessionStore
  const refresh = getRefreshToken(area)
  if (refresh) authApi.logout(refresh, area).catch(() => {})
  clearTokens(area)
  store.getState().setUser(null)
  if (area === "customer") {
    // The database cart (customer_management.customer_cart) — including
    // any applied promo code/offer, which lives on that same Cart row — is
    // untouched; only this browser's local guest-cart state is cleared, so
    // the next visitor on this browser (a guest, or a *different* customer
    // logging in) never sees this customer's items. That customer's own
    // cart is exactly as they left it next time they log in.
    useCartStore.getState().clearCart()
  }
}

type LoginResult = { success: true } | { success: false; error: string; unverifiedEmail?: string }

async function performLogin(email: string, password: string, expectedRole: "ADMIN" | "CUSTOMER"): Promise<LoginResult> {
  const area: SessionArea = expectedRole === "ADMIN" ? "admin" : "customer"
  try {
    const payload = await authApi.login({ email, password })
    if (payload.user.role !== expectedRole) {
      if (import.meta.env.DEV) {
        // Temporary, dev-only — pairs with ProtectedRoute.tsx's and
        // auth-store.ts's bootstrap() logs for tracing auth decisions.
        // eslint-disable-next-line no-console
        console.debug("[auth-store] performLogin role mismatch", {
          expectedRole,
          actualRole: payload.user.role,
          userId: payload.user.id,
        })
      }
      // Deliberately generic: naming the actual account type here would let
      // an attacker use this form to probe which role a given email/password
      // pair belongs to. Keep this identical to a genuine wrong-password
      // error (see the catch block below and Login.tsx's top-of-file note).
      return {
        success: false,
        error: "Invalid email or password.",
      }
    }
    setTokens(payload.access, payload.refresh, area)
    const store = area === "admin" ? useAdminSessionStore : useCustomerSessionStore
    store.getState().setUser(payload.user)
    return { success: true }
  } catch (err) {
    if (err instanceof ApiError) {
      const unverifiedEmail = err.status === 403 ? (err.errors?.email as string | undefined) : undefined
      return { success: false, error: err.message, unverifiedEmail }
    }
    return { success: false, error: "Something went wrong. Please try again." }
  }
}

// Same role-gated shape as performLogin above, but for the Google Sign-In
// flow: `credential` is the ID token the frontend's Google Identity
// Services button already got directly from Google (@react-oauth/google's
// GoogleLogin component) — this just hands it to the backend for real
// verification and applies the exact same session-setup/role-check the
// password login path uses, so every downstream consumer of LoginResult
// keeps working unchanged.
async function performGoogleLogin(credential: string, expectedRole: "ADMIN" | "CUSTOMER"): Promise<LoginResult> {
  const area: SessionArea = expectedRole === "ADMIN" ? "admin" : "customer"
  try {
    const payload = await authApi.google({ credential })
    if (payload.user.role !== expectedRole) {
      return {
        success: false,
        error: "This Google account isn't registered as a customer.",
      }
    }
    setTokens(payload.access, payload.refresh, area)
    const store = area === "admin" ? useAdminSessionStore : useCustomerSessionStore
    store.getState().setUser(payload.user)
    return { success: true }
  } catch (err) {
    if (err instanceof ApiError) {
      return { success: false, error: err.message }
    }
    return { success: false, error: "Something went wrong. Please try again." }
  }
}

interface CustomerAuthFacade {
  customer: CustomerUser | null
  login: (email: string, password: string) => Promise<LoginResult>
  googleLogin: (credential: string) => Promise<LoginResult>
  logout: () => void
}

export function useCustomerAuthStore<T>(selector: (state: CustomerAuthFacade) => T): T {
  const user = useCustomerSessionStore((s) => s.user)
  // Memoized so the facade object is referentially stable across renders
  // when `user` hasn't changed — otherwise every selector call returns a
  // brand-new object and any consumer keying off the whole facade
  // (dependency arrays, etc.) would re-run every render.
  const facade = useMemo<CustomerAuthFacade>(() => {
    const isCustomer = hasValidSession(user, "CUSTOMER")
    return {
      customer: isCustomer ? toCustomerUser(user!) : null,
      login: (email, password) => performLogin(email, password, "CUSTOMER"),
      googleLogin: (credential) => performGoogleLogin(credential, "CUSTOMER"),
      logout: () => doLogout("customer"),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])
  return selector(facade)
}

interface AdminAuthFacade {
  admin: AdminUser | null
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => void
}

export function useAdminAuthStore<T>(selector: (state: AdminAuthFacade) => T): T {
  const user = useAdminSessionStore((s) => s.user)
  const facade = useMemo<AdminAuthFacade>(() => {
    const isAdmin = hasValidSession(user, "ADMIN")
    return {
      admin: isAdmin ? toAdminUser(user!) : null,
      login: (email, password) => performLogin(email, password, "ADMIN"),
      logout: () => doLogout("admin"),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])
  return selector(facade)
}
