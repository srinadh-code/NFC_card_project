import { useMemo } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { AdminUser, CustomerUser } from "@/types"
import { ApiError, type ApiUser, authApi, clearTokens, getAccessToken, getRefreshToken, setTokens } from "@/lib/api"

interface AuthState {
  user: ApiUser | null
  hydrated: boolean
  setUser: (user: ApiUser | null) => void
  bootstrap: () => Promise<void>
}

/**
 * Single real session store backed by the Django JWT API. The persisted
 * `user` object drives instant route-guard decisions on load (no flash of
 * the wrong screen); `bootstrap()` re-validates it against the server once
 * the app mounts so a revoked/expired session gets cleared for real.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
      setUser: (user) => set({ user }),
      bootstrap: async () => {
        if (!getAccessToken()) {
          set({ hydrated: true })
          return
        }
        try {
          const user = await authApi.me()
          set({ user, hydrated: true })
        } catch {
          clearTokens()
          set({ user: null, hydrated: true })
        }
      },
    }),
    { name: "nexora-auth", partialize: (s) => ({ user: s.user }) },
  ),
)

function toCustomerUser(u: ApiUser): CustomerUser {
  return { id: String(u.id), name: u.full_name, email: u.email, avatar: u.avatar }
}

function toAdminUser(u: ApiUser): AdminUser {
  return { name: u.full_name || "Admin", email: u.email, role: "Super Admin", avatar: u.avatar }
}

function doLogout() {
  const refresh = getRefreshToken()
  if (refresh) authApi.logout(refresh).catch(() => {})
  clearTokens()
  useAuthStore.getState().setUser(null)
}

type LoginResult = { success: true } | { success: false; error: string; unverifiedEmail?: string }

async function performLogin(email: string, password: string, expectedRole: "ADMIN" | "CUSTOMER"): Promise<LoginResult> {
  try {
    const payload = await authApi.login({ email, password })
    if (payload.user.role !== expectedRole) {
      return { success: false, error: `No ${expectedRole.toLowerCase()} account found with those credentials.` }
    }
    setTokens(payload.access, payload.refresh)
    useAuthStore.getState().setUser(payload.user)
    return { success: true }
  } catch (err) {
    if (err instanceof ApiError) {
      const unverifiedEmail = err.status === 403 ? (err.errors?.email as string | undefined) : undefined
      return { success: false, error: err.message, unverifiedEmail }
    }
    return { success: false, error: "Something went wrong. Please try again." }
  }
}

interface CustomerAuthFacade {
  customer: CustomerUser | null
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => void
}

export function useCustomerAuthStore<T>(selector: (state: CustomerAuthFacade) => T): T {
  const user = useAuthStore((s) => s.user)
  // Memoized so the facade object is referentially stable across renders
  // when `user` hasn't changed — otherwise every selector call returns a
  // brand-new object and React's useSyncExternalStore loops forever.
  const facade = useMemo<CustomerAuthFacade>(() => {
    const isCustomer = user?.role === "CUSTOMER"
    return {
      customer: isCustomer ? toCustomerUser(user!) : null,
      login: (email, password) => performLogin(email, password, "CUSTOMER"),
      logout: doLogout,
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
  const user = useAuthStore((s) => s.user)
  const facade = useMemo<AdminAuthFacade>(() => {
    const isAdmin = user?.role === "ADMIN"
    return {
      admin: isAdmin ? toAdminUser(user!) : null,
      login: (email, password) => performLogin(email, password, "ADMIN"),
      logout: doLogout,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])
  return selector(facade)
}
