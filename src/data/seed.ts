// Local-only starting state for the parts of the app that don't yet have a
// backend endpoint (orders, admin customer/card management, transactions,
// support tickets, analytics, activity). Real data flows in through
// `@/store/data-store`'s CRUD actions and the real API client (`@/lib/api`)
// once a customer signs up, orders, taps their card, etc. — these arrays
// intentionally start empty rather than pre-populated with generated demo
// rows.
import type {
  ActivityRecord,
  AnalyticsRecord,
  Customer,
  NfcCard,
  Order,
  Profile,
  SupportTicket,
  Transaction,
} from "@/types"

export const customers: Customer[] = []
export const customerById = new Map<string, Customer>(customers.map((c) => [c.id, c]))

export const nfcCards: NfcCard[] = []

export const profiles: Profile[] = []
export const profileByUsername = new Map<string, Profile>(profiles.map((p) => [p.username, p]))

export const orders: Order[] = []

export const transactions: Transaction[] = []

export const analyticsRecords: AnalyticsRecord[] = []

export const activityRecords: ActivityRecord[] = []

export const supportTickets: SupportTicket[] = []
