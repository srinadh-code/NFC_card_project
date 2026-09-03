import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { AdminUser, CustomerUser } from "@/types"
import { customers } from "@/data/seed"
import { useDataStore } from "@/store/data-store"

const ADMIN_CREDENTIALS = { email: "admin@taplink.com", password: "admin123" }
const CUSTOMER_CREDENTIALS = { email: "user@taplink.com", password: "user123" }

interface AdminAuthState {
  admin: AdminUser | null
  login: (email: string, password: string) => { success: boolean; error?: string }
  logout: () => void
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      admin: null,
      login: (email, password) => {
        if (email.trim().toLowerCase() !== ADMIN_CREDENTIALS.email || password !== ADMIN_CREDENTIALS.password) {
          return { success: false, error: "Invalid email or password." }
        }
        set({
          admin: {
            name: "Admin",
            email: ADMIN_CREDENTIALS.email,
            role: "Super Admin",
            avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=taplink-admin",
          },
        })
        return { success: true }
      },
      logout: () => set({ admin: null }),
    }),
    { name: "taplink-admin-auth" },
  ),
)

interface CustomerAuthState {
  customer: CustomerUser | null
  // Local "account directory" for customers created via Register — this is
  // a frontend-only mock (no real backend), but it makes the core flow
  // real: register once, log back in later with the same email/password.
  // Keyed by lowercased email.
  accounts: Record<string, { password: string; customerId: string }>
  login: (email: string, password: string) => { success: boolean; error?: string }
  register: (name: string, email: string, phone?: string, password?: string) => { success: boolean; error?: string }
  logout: () => void
  /** Idempotent repair: if the signed-in customer is missing its backing
   * Customer/Profile records (e.g. a session created before onboarding was
   * fixed), create them now using the customer's existing id. Safe to call
   * on every load — a no-op once the records exist. */
  repairSession: () => void
}

export const useCustomerAuthStore = create<CustomerAuthState>()(
  persist(
    (set, get) => ({
      customer: null,
      accounts: {},
      login: (email, password) => {
        const normalized = email.trim().toLowerCase()

        if (normalized === CUSTOMER_CREDENTIALS.email && password === CUSTOMER_CREDENTIALS.password) {
          const demo = customers[0]
          set({
            customer: { id: demo.id, name: demo.name, email: demo.email, avatar: demo.avatar },
          })
          return { success: true }
        }

        const account = get().accounts[normalized]
        if (account && account.password === password) {
          const record = useDataStore.getState().customers.find((c) => c.id === account.customerId)
          if (record) {
            set({
              customer: { id: record.id, name: record.name, email: record.email, avatar: record.avatar },
            })
            return { success: true }
          }
        }

        return { success: false, error: "Invalid email or password. Try user@taplink.com / user123." }
      },
      register: (name, email, phone, password) => {
        const normalized = email.trim().toLowerCase()
        if (
          normalized === CUSTOMER_CREDENTIALS.email ||
          get().accounts[normalized] ||
          useDataStore.getState().customers.some((c) => c.email.toLowerCase() === normalized)
        ) {
          return { success: false, error: "An account with this email already exists. Please login instead." }
        }

        const avatar = `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(email)}`
        // Onboarding: mint a fresh Customer + Profile (with default social
        // links) together so Profile/Social Links/QR Code all work the
        // instant the new user lands on their dashboard.
        const { customer } = useDataStore.getState().ensureCustomerProfile({
          name: name || "New User",
          email,
          phone,
          avatar,
        })
        set((s) => ({
          customer: { id: customer.id, name: customer.name, email: customer.email, avatar: customer.avatar },
          accounts: {
            ...s.accounts,
            [normalized]: { password: password || "", customerId: customer.id },
          },
        }))
        return { success: true }
      },
      logout: () => set({ customer: null }),
      repairSession: () => {
        const current = get().customer
        if (!current) return
        const { customer } = useDataStore.getState().ensureCustomerProfile({
          id: current.id,
          name: current.name,
          email: current.email,
          avatar: current.avatar,
        })
        set({
          customer: { id: customer.id, name: customer.name, email: customer.email, avatar: customer.avatar },
        })
      },
    }),
    { name: "taplink-customer-auth" },
  ),
)

export const ADMIN_DEMO_CREDENTIALS = ADMIN_CREDENTIALS
export const CUSTOMER_DEMO_CREDENTIALS = CUSTOMER_CREDENTIALS
