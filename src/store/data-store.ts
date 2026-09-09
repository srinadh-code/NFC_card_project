import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  CardStatus,
  Customer,
  NfcCard,
  Order,
  OrderStatus,
  PaymentStatus,
  Profile,
  SocialLink,
  SupportTicket,
  Transaction,
} from "@/types"
import {
  customers as seedCustomers,
  nfcCards as seedCards,
  orders as seedOrders,
  profiles as seedProfiles,
  supportTickets as seedTickets,
  transactions as seedTransactions,
} from "@/data/seed"

function nextId(prefix: string, existing: { id: string }[], len = 3) {
  let max = 0
  for (const item of existing) {
    const n = Number(item.id.replace(prefix, ""))
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(len, "0")}`
}

// The 5-step tracking timeline stays in lockstep with `Order.status` no
// matter which admin action changed it — a status change without a
// matching tracking update would leave the customer's Track Order page
// showing stale progress.
const TRACKING_LABELS = ["Order Placed", "Order Confirmed", "Shipped", "Out for Delivery", "Delivered"]

function stepsReachedFor(status: OrderStatus): number {
  switch (status) {
    case "Pending":
      return 0
    case "Processing":
      return 1
    case "Shipped":
      return 2
    case "Delivered":
    case "Completed":
      return 4
    case "Cancelled":
      return 0
    default:
      return 0
  }
}

function retrackOrder(order: Order, status: OrderStatus): Order["tracking"] {
  const reached = stepsReachedFor(status)
  const now = new Date().toISOString()
  return TRACKING_LABELS.map((label, i) => {
    const wasDone = order.tracking[i]?.done ?? false
    const done = status === "Cancelled" ? i === 0 : i <= reached
    return {
      label,
      done,
      date: done ? (wasDone ? order.tracking[i]!.date : now) : null,
    }
  })
}

const DEFAULT_SOCIAL_PLATFORMS: SocialLink["platform"][] = [
  "Facebook",
  "Instagram",
  "LinkedIn",
  "Twitter",
  "YouTube",
  "WhatsApp",
  "Telegram",
  "Website",
  "GitHub",
]

function slugifyUsername(name: string, email: string) {
  const base = (name || email.split("@")[0] || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16)
  return base || "user"
}

function uniqueUsername(base: string, existingProfiles: { username: string }[]) {
  let candidate = base
  let i = 1
  const taken = new Set(existingProfiles.map((p) => p.username))
  while (taken.has(candidate)) {
    candidate = `${base}${i}`
    i++
  }
  return candidate
}

interface DataState {
  customers: Customer[]
  cards: NfcCard[]
  orders: Order[]
  profiles: Profile[]
  tickets: SupportTicket[]
  transactions: Transaction[]

  // Customers
  addCustomer: (c: Omit<Customer, "id" | "totalOrders" | "totalSpent" | "totalTaps">) => Customer
  updateCustomer: (id: string, patch: Partial<Customer>) => void
  deleteCustomer: (id: string) => void
  // Onboarding: atomically ensures a Customer + Profile (with default social
  // links) exist for a signed-in user. Pass `id` to repair/fetch an existing
  // customer's records (idempotent — returns what's already there if
  // present); omit it to mint a brand-new customer id for a fresh signup.
  ensureCustomerProfile: (input: {
    id?: string
    name: string
    email: string
    phone?: string
    avatar: string
  }) => { customer: Customer; profile: Profile }

  // Cards
  addCard: (c: Omit<NfcCard, "id">) => NfcCard
  updateCard: (id: string, patch: Partial<NfcCard>) => void
  deleteCard: (id: string) => void
  assignCard: (id: string, customerId: string) => void
  activateCard: (uid: string, customerId: string) => NfcCard | null
  // One-click activation for a card already assigned to a customer — no UID
  // entry needed, since the customer can already see this exact card.
  activateAssignedCard: (cardId: string) => NfcCard | null
  blockCard: (id: string) => void
  markLost: (id: string) => void
  unassignCard: (id: string) => void

  // Orders
  addOrder: (o: Omit<Order, "id">) => Order
  updateOrderStatus: (id: string, status: OrderStatus) => void
  updateOrder: (id: string, patch: Partial<Order>) => void
  // Admin fulfillment step: links a physical NFC card to the order (and its
  // customer) so it shows up on the customer's My Card page as "Assigned".
  assignCardToOrder: (orderId: string, cardId: string) => void

  // Profiles
  updateProfile: (id: string, patch: Partial<Profile>) => void
  toggleSocialLink: (id: string, platform: SocialLink["platform"]) => void
  setProfileStatus: (id: string, status: Profile["status"]) => void

  // Tickets
  addTicket: (t: Omit<SupportTicket, "id">) => SupportTicket
  updateTicketStatus: (id: string, status: SupportTicket["status"]) => void
  addTicketMessage: (id: string, msg: { from: "customer" | "support"; text: string }) => void

  // Transactions
  addTransaction: (t: Omit<Transaction, "id">) => Transaction
}

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      customers: seedCustomers,
      cards: seedCards,
      orders: seedOrders,
      profiles: seedProfiles,
      tickets: seedTickets,
      transactions: seedTransactions,

      addCustomer: (c) => {
        const id = nextId("CUS", get().customers)
        const customer: Customer = { ...c, id, totalOrders: 0, totalSpent: 0, totalTaps: 0 }
        set((s) => ({ customers: [customer, ...s.customers] }))
        return customer
      },
      updateCustomer: (id, patch) =>
        set((s) => ({
          customers: s.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      deleteCustomer: (id) =>
        set((s) => ({ customers: s.customers.filter((c) => c.id !== id) })),

      ensureCustomerProfile: (input) => {
        const state = get()
        const existingCustomer = input.id ? state.customers.find((c) => c.id === input.id) : undefined
        const existingProfile = existingCustomer
          ? state.profiles.find((p) => p.customerId === existingCustomer.id)
          : undefined

        if (existingCustomer && existingProfile) {
          return { customer: existingCustomer, profile: existingProfile }
        }

        const id = existingCustomer?.id ?? input.id ?? nextId("CUS", state.customers)
        const now = new Date().toISOString()

        let profile = existingProfile
        let customer: Customer =
          existingCustomer ?? {
            id,
            name: input.name || "New User",
            email: input.email,
            phone: input.phone ?? "",
            company: "",
            designation: "",
            address: { line1: "", city: "", state: "", pincode: "", country: "India" },
            profileUrl: "",
            username: "",
            status: "Active",
            avatar: input.avatar,
            joinedOn: now,
            totalOrders: 0,
            totalSpent: 0,
            totalTaps: 0,
          }

        if (!profile) {
          const username = uniqueUsername(slugifyUsername(input.name, input.email), state.profiles)
          customer = { ...customer, username, profileUrl: `vrsnexora.com/u/${username}` }
          profile = {
            id: nextId("PRO", state.profiles),
            customerId: id,
            username,
            fullName: input.name || "New User",
            designation: "",
            company: "",
            email: input.email,
            phone: input.phone ?? "",
            alternatePhone: "",
            website: "",
            address: "",
            city: "",
            state: "",
            country: "",
            googleMapsUrl: "",
            bio: "",
            avatar: input.avatar,
            coverImage: null,
            status: "Active",
            createdOn: now,
            services: [],
            socialLinks: DEFAULT_SOCIAL_PLATFORMS.map((platform, order) => ({
              platform,
              url: "",
              enabled: false,
              order,
            })),
            customLinks: [],
            customFields: [],
          }
        }

        set((s) => ({
          customers: existingCustomer
            ? s.customers.map((c) => (c.id === id ? customer : c))
            : [customer, ...s.customers],
          profiles: existingProfile ? s.profiles : [profile as Profile, ...s.profiles],
        }))

        return { customer, profile: profile as Profile }
      },

      addCard: (c) => {
        const id = nextId("NFC", get().cards, 4)
        const card: NfcCard = { ...c, id }
        set((s) => ({ cards: [card, ...s.cards] }))
        return card
      },
      updateCard: (id, patch) =>
        set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      deleteCard: (id) => set((s) => ({ cards: s.cards.filter((c) => c.id !== id) })),
      assignCard: (id, customerId) => {
        const customer = get().customers.find((c) => c.id === customerId)
        set((s) => ({
          cards: s.cards.map((c) =>
            c.id === id
              ? {
                  ...c,
                  customerId,
                  customerName: customer?.name ?? null,
                  status: "Assigned" as CardStatus,
                  assignedOn: new Date().toISOString(),
                }
              : c,
          ),
        }))
      },
      activateCard: (uid, customerId) => {
        const card = get().cards.find((c) => c.uid.toLowerCase() === uid.toLowerCase())
        if (!card) return null
        const customer = get().customers.find((c) => c.id === customerId)
        const updated: NfcCard = {
          ...card,
          customerId,
          customerName: customer?.name ?? null,
          status: "Active",
          assignedOn: card.assignedOn ?? new Date().toISOString(),
          activatedOn: new Date().toISOString(),
        }
        set((s) => ({ cards: s.cards.map((c) => (c.id === card.id ? updated : c)) }))
        return updated
      },
      activateAssignedCard: (cardId) => {
        const card = get().cards.find((c) => c.id === cardId)
        if (!card || !card.customerId) return null
        const updated: NfcCard = { ...card, status: "Active", activatedOn: new Date().toISOString() }
        set((s) => ({ cards: s.cards.map((c) => (c.id === cardId ? updated : c)) }))
        return updated
      },
      blockCard: (id) =>
        set((s) => ({
          cards: s.cards.map((c) => (c.id === id ? { ...c, status: "Blocked" } : c)),
        })),
      markLost: (id) =>
        set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, status: "Lost" } : c)) })),
      unassignCard: (id) =>
        set((s) => ({
          cards: s.cards.map((c) =>
            c.id === id
              ? {
                  ...c,
                  customerId: null,
                  customerName: null,
                  status: "Unassigned",
                  assignedOn: null,
                  activatedOn: null,
                }
              : c,
          ),
        })),

      addOrder: (o) => {
        const id = nextId("ORD", get().orders)
        const order: Order = { ...o, id }
        set((s) => ({
          orders: [order, ...s.orders],
          // Keep the customer's aggregate stats (shown on Admin > Customer
          // Details) in sync the moment an order is placed — a Cancelled
          // order never counts, but a fresh order is never created as
          // Cancelled, so this always applies on creation.
          customers:
            order.status === "Cancelled"
              ? s.customers
              : s.customers.map((c) =>
                  c.id === order.customerId
                    ? { ...c, totalOrders: c.totalOrders + 1, totalSpent: c.totalSpent + order.total }
                    : c,
                ),
        }))
        return order
      },
      updateOrderStatus: (id, status) =>
        set((s) => {
          const order = s.orders.find((o) => o.id === id)
          if (!order) return s
          const wasCancelled = order.status === "Cancelled"
          const willBeCancelled = status === "Cancelled"
          const customers =
            wasCancelled === willBeCancelled
              ? s.customers
              : s.customers.map((c) => {
                  if (c.id !== order.customerId) return c
                  const sign = willBeCancelled ? -1 : 1
                  return {
                    ...c,
                    totalOrders: c.totalOrders + sign,
                    totalSpent: c.totalSpent + sign * order.total,
                  }
                })
          return {
            orders: s.orders.map((o) =>
              o.id === id ? { ...o, status, tracking: retrackOrder(o, status) } : o,
            ),
            customers,
          }
        }),
      updateOrder: (id, patch) =>
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      assignCardToOrder: (orderId, cardId) => {
        const order = get().orders.find((o) => o.id === orderId)
        const card = get().cards.find((c) => c.id === cardId)
        if (!order || !card) return
        const now = new Date().toISOString()
        set((s) => ({
          orders: s.orders.map((o) => (o.id === orderId ? { ...o, assignedCardId: cardId } : o)),
          cards: s.cards.map((c) =>
            c.id === cardId
              ? {
                  ...c,
                  customerId: order.customerId,
                  customerName: order.customerName,
                  status: "Assigned" as CardStatus,
                  assignedOn: now,
                }
              : c,
          ),
        }))
      },

      updateProfile: (id, patch) =>
        set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      toggleSocialLink: (id, platform) =>
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === id
              ? {
                  ...p,
                  socialLinks: p.socialLinks.map((l) =>
                    l.platform === platform ? { ...l, enabled: !l.enabled } : l,
                  ),
                }
              : p,
          ),
        })),
      setProfileStatus: (id, status) =>
        set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? { ...p, status } : p)) })),

      addTicket: (t) => {
        const id = nextId("TKT", get().tickets)
        const ticket: SupportTicket = { ...t, id }
        set((s) => ({ tickets: [ticket, ...s.tickets] }))
        return ticket
      },
      updateTicketStatus: (id, status) =>
        set((s) => ({
          tickets: s.tickets.map((t) =>
            t.id === id ? { ...t, status, updatedOn: new Date().toISOString() } : t,
          ),
        })),
      addTicketMessage: (id, msg) =>
        set((s) => ({
          tickets: s.tickets.map((t) =>
            t.id === id
              ? {
                  ...t,
                  updatedOn: new Date().toISOString(),
                  messages: [...t.messages, { ...msg, date: new Date().toISOString() }],
                }
              : t,
          ),
        })),

      addTransaction: (t) => {
        const id = nextId("TRX", get().transactions)
        const txn: Transaction = { ...t, id }
        set((s) => ({ transactions: [txn, ...s.transactions] }))
        return txn
      },
    }),
    {
      name: "taplink-data",
      // v6: seed.ts no longer ships generated demo rows — force any
      // browser that already persisted the old faker-generated dataset
      // to drop it and start from the (now empty) seed arrays.
      version: 6,
      migrate: (_persistedState, version) =>
        version < 6
          ? {
              customers: seedCustomers,
              cards: seedCards,
              orders: seedOrders,
              profiles: seedProfiles,
              tickets: seedTickets,
              transactions: seedTransactions,
            }
          : (_persistedState as DataState),
    },
  ),
)

// Convenience selectors -------------------------------------------------
//
// The `*ByCustomer` selectors below build derived arrays with `.filter()`.
// A selector passed to `useDataStore()` is invoked on every store snapshot
// check, and React's `useSyncExternalStore` (which zustand v5 is built on)
// requires the returned value to be referentially stable when the
// underlying state hasn't changed — otherwise it looks like the store is
// changing every render and React logs "The result of getSnapshot should
// be cached" and can spin into "Maximum update depth exceeded". A plain
// `.filter()` allocates a brand-new array every call, so we memoize each
// factory's result per id, keyed off the source array's identity: as long
// as `s.cards`/`s.orders`/`s.tickets` hasn't been replaced (i.e. no
// mutation happened), we hand back the exact same array reference.
function memoizedFilterSelector<T>(sourceOf: (s: DataState) => T[], predicate: (item: T, key: string) => boolean) {
  const cache = new Map<string, { source: T[]; result: T[] }>()
  return (key: string) => (s: DataState) => {
    const source = sourceOf(s)
    const cached = cache.get(key)
    if (cached && cached.source === source) return cached.result
    const result = source.filter((item) => predicate(item, key))
    cache.set(key, { source, result })
    return result
  }
}

export const selectCustomerById = (id: string) => (s: DataState) =>
  s.customers.find((c) => c.id === id)
export const selectCardsByCustomer = memoizedFilterSelector(
  (s) => s.cards,
  (c, customerId) => c.customerId === customerId,
)
export const selectOrdersByCustomer = memoizedFilterSelector(
  (s) => s.orders,
  (o, customerId) => o.customerId === customerId,
)
export const selectProfileByCustomer = (customerId: string) => (s: DataState) =>
  s.profiles.find((p) => p.customerId === customerId)
export const selectProfileByUsername = (username: string) => (s: DataState) =>
  s.profiles.find((p) => p.username === username)
export const selectTicketsByCustomer = memoizedFilterSelector(
  (s) => s.tickets,
  (t, customerId) => t.customerId === customerId,
)
export const selectTransactionsByCustomer = memoizedFilterSelector(
  (s) => s.transactions,
  (t, customerId) => t.customerId === customerId,
)
