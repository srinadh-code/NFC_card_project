import { fakerEN_IN as faker } from "@faker-js/faker"
import type {
  ActivityRecord,
  AnalyticsRecord,
  Customer,
  CustomField,
  NfcCard,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Profile,
  SocialLink,
  SupportTicket,
  Transaction,
  TrackingStep,
  TrafficSource,
} from "@/types"
import {
  COMPANIES,
  DESIGNATIONS,
  INDIAN_STATES,
  PRODUCTS,
  TOP_LOCATIONS,
} from "@/data/constants"

faker.seed(1102)

function pad(n: number, len = 4) {
  return String(n).padStart(len, "0")
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(faker.number.float() * arr.length)] as T
}

function weightedLocation(): string {
  const total = TOP_LOCATIONS.reduce((s, l) => s + l.weight, 0)
  let r = faker.number.float() * total
  for (const l of TOP_LOCATIONS) {
    if (r < l.weight) return l.location
    r -= l.weight
  }
  return TOP_LOCATIONS[0].location
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 14)
}

function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
const CUSTOMER_COUNT = 100
const usedUsernames = new Set<string>()

function makeUsername(name: string) {
  let base = slugify(name)
  let candidate = base
  let i = 1
  while (usedUsernames.has(candidate)) {
    candidate = `${base}${i}`
    i++
  }
  usedUsernames.add(candidate)
  return candidate
}

export const customers: Customer[] = Array.from({ length: CUSTOMER_COUNT }).map((_, i) => {
  const idx = i + 1
  const isDemo = idx === 1
  const firstName = isDemo ? "Srinadh" : faker.person.firstName()
  const lastName = isDemo ? "R" : faker.person.lastName()
  const name = `${firstName} ${lastName}`
  const username = isDemo ? "srinadh" : makeUsername(name)
  if (isDemo) usedUsernames.add(username)
  const joined = isoDaysAgo(faker.number.int({ min: 5, max: 720 }))
  const status: Customer["status"] = faker.number.float() < 0.85 ? "Active" : "Inactive"

  return {
    id: `CUS${pad(idx, 3)}`,
    name,
    email: isDemo ? "user@taplink.com" : faker.internet.email({ firstName, lastName }).toLowerCase(),
    phone: isDemo ? "+91 98765 43210" : `+91 ${faker.string.numeric(5)}${faker.string.numeric(5)}`,
    company: isDemo ? "TapLink Technologies Pvt. Ltd." : pick(COMPANIES),
    designation: isDemo ? "Software Developer" : pick(DESIGNATIONS),
    address: {
      line1: faker.location.streetAddress(),
      city: isDemo ? "Hyderabad" : faker.location.city(),
      state: isDemo ? "Telangana" : pick(INDIAN_STATES),
      pincode: faker.location.zipCode("######"),
      country: "India",
    },
    profileUrl: `taplink.com/u/${username}`,
    username,
    status,
    avatar: `https://api.dicebear.com/9.x/notionists/svg?seed=${username}`,
    joinedOn: joined,
    totalOrders: 0,
    totalSpent: 0,
    totalTaps: 0,
  }
})

export const customerById = new Map(customers.map((c) => [c.id, c]))

// ---------------------------------------------------------------------------
// NFC Cards
// ---------------------------------------------------------------------------
const CARD_COUNT = 300
const CARD_TYPES = ["Standard", "Premium", "Wooden", "Metal"] as const
const CARD_COLOR_NAMES = ["Black", "Blue", "Red", "White", "Green", "Silver", "Gold", "Natural"]

export const nfcCards: NfcCard[] = Array.from({ length: CARD_COUNT }).map((_, i) => {
  const idx = i + 1
  const assigned = idx <= 210 // ~70% assigned to a customer
  const customer = assigned ? customers[i % customers.length] : null
  const purchaseDate = isoDaysAgo(faker.number.int({ min: 1, max: 500 }))
  let status: NfcCard["status"] = "Unassigned"
  let activatedOn: string | null = null
  let assignedOn: string | null = null

  if (assigned) {
    assignedOn = isoDaysAgo(faker.number.int({ min: 5, max: 450 }))
    const roll = faker.number.float()
    // NOTE: the Active threshold (0.78) is kept exactly where it was before
    // "Assigned" existed, so the deterministically-seeded demo card (idx 1,
    // customer CUS001) keeps landing on "Active" as already verified — the
    // new "Assigned" bucket is carved out of what used to be "Inactive".
    if (roll < 0.78) {
      status = "Active"
      activatedOn = isoDaysAgo(faker.number.int({ min: 0, max: 400 }))
    } else if (roll < 0.84) {
      status = "Assigned"
    } else if (roll < 0.9) {
      status = "Inactive"
    } else if (roll < 0.96) {
      status = "Blocked"
    } else {
      status = "Lost"
    }
  }

  return {
    id: `NFC${pad(1000 + idx, 4)}`,
    uid: `04${faker.string.hexadecimal({ length: 8, casing: "upper", prefix: "" })}`,
    serialNumber: `SN${pad(idx, 6)}`,
    cardType: pick(CARD_TYPES),
    color: pick(CARD_COLOR_NAMES),
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? null,
    status,
    assignedOn,
    activatedOn,
    purchaseDate,
  }
})

// ---------------------------------------------------------------------------
// Profiles (one per customer that has at least one active card)
// ---------------------------------------------------------------------------
const SOCIAL_PLATFORMS: SocialLink["platform"][] = [
  "LinkedIn",
  "Instagram",
  "Facebook",
  "WhatsApp",
  "YouTube",
  "Twitter",
  "GitHub",
  "Telegram",
  "Website",
]

function socialLinksFor(username: string, isDemo: boolean): SocialLink[] {
  return SOCIAL_PLATFORMS.map((platform, idx) => {
    let url = ""
    switch (platform) {
      case "LinkedIn":
        url = `https://linkedin.com/in/${username}`
        break
      case "Instagram":
        url = `https://instagram.com/${username}`
        break
      case "Facebook":
        url = `https://facebook.com/${username}`
        break
      case "WhatsApp":
        url = `https://wa.me/9198765${faker.string.numeric(5)}`
        break
      case "YouTube":
        url = `https://youtube.com/@${username}`
        break
      case "Twitter":
        url = `https://x.com/${username}`
        break
      case "GitHub":
        url = `https://github.com/${username}`
        break
      case "Telegram":
        url = `https://t.me/${username}`
        break
      case "Website":
        url = `https://${username}.com`
        break
    }
    const enabled = isDemo
      ? ["LinkedIn", "Instagram", "WhatsApp", "GitHub", "Website"].includes(platform)
      : faker.number.float() < 0.5
    return { platform, url, enabled, order: idx }
  })
}

function customFieldsFor(isDemo: boolean): CustomField[] {
  if (isDemo) {
    return [
      { id: "FLD001", label: "GST Number", value: "36ABCDE1234F1Z5", order: 0 },
      { id: "FLD002", label: "Experience", value: "6+ years", order: 1 },
      { id: "FLD003", label: "Portfolio", value: "https://srinadh.dev/work", order: 2 },
    ]
  }
  if (faker.number.float() < 0.3) {
    return [{ id: `FLD-${faker.string.alphanumeric(6)}`, label: "Experience", value: `${faker.number.int({ min: 1, max: 15 })}+ years`, order: 0 }]
  }
  return []
}

export const profiles: Profile[] = customers.map((c, i) => {
  const isDemo = i === 0
  return {
    id: `PRO${pad(i + 1, 3)}`,
    customerId: c.id,
    username: c.username,
    fullName: c.name,
    designation: c.designation,
    company: c.company,
    email: c.email,
    phone: c.phone,
    website: isDemo ? "https://srinadh.dev" : `https://${c.username}.com`,
    address: `${c.address.city}, ${c.address.state}, India`,
    bio: isDemo
      ? "Building smart digital connections with a single tap."
      : faker.person.bio(),
    avatar: c.avatar,
    status: faker.number.float() < 0.94 ? "Active" : "Suspended",
    createdOn: c.joinedOn,
    socialLinks: socialLinksFor(c.username, isDemo),
    customLinks: isDemo
      ? [{ id: "CLK001", label: "Book a Call", url: "https://cal.com/srinadh", enabled: true, order: 0 }]
      : [],
    customFields: customFieldsFor(isDemo),
  }
})

export const profileByUsername = new Map(profiles.map((p) => [p.username, p]))

// ---------------------------------------------------------------------------
// Orders + Transactions
// ---------------------------------------------------------------------------
const ORDER_COUNT = 150
const ORDER_STATUSES: OrderStatus[] = [
  "Pending",
  "Processing",
  "Shipped",
  "Delivered",
  "Completed",
  "Cancelled",
]
const PAYMENT_METHODS: PaymentMethod[] = ["UPI", "Card", "Net Banking", "Razorpay", "COD"]

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
  }
}

function trackingFor(status: OrderStatus, orderDate: string): TrackingStep[] {
  const reached = stepsReachedFor(status)
  const base = new Date(orderDate)
  return TRACKING_LABELS.map((label, i) => {
    const done = status === "Cancelled" ? i === 0 : i <= reached
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    return { label, date: done ? d.toISOString() : null, done }
  })
}

export const orders: Order[] = Array.from({ length: ORDER_COUNT }).map((_, i) => {
  const idx = i + 1
  const customer = customers[faker.number.int({ min: 0, max: customers.length - 1 })]
  const itemCount = faker.number.int({ min: 1, max: 2 })
  const items: OrderItem[] = Array.from({ length: itemCount }).map(() => {
    const product = pick(PRODUCTS)
    const color = pick(product.colors)
    const qty = faker.number.int({ min: 1, max: 3 })
    return {
      productId: product.id,
      name: product.name,
      cardType: product.cardType,
      color: color.name,
      qty,
      price: product.price,
    }
  })
  const amount = items.reduce((s, it) => s + it.price * it.qty, 0)
  const shipping = amount > 999 ? 0 : 49
  const total = amount + shipping
  const date = isoDaysAgo(faker.number.int({ min: 0, max: 400 }))
  const status = pick(ORDER_STATUSES)
  const paymentStatus: PaymentStatus =
    status === "Cancelled"
      ? pick(["Refunded", "Failed"])
      : status === "Pending"
        ? "Pending"
        : "Paid"

  return {
    id: `ORD${pad(idx, 3)}`,
    customerId: customer.id,
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    items,
    amount,
    shipping,
    total,
    paymentMethod: pick(PAYMENT_METHODS),
    paymentStatus,
    status,
    date,
    address: customer.address,
    tracking: trackingFor(status, date),
    assignedCardId: null,
  }
})

// Link a subset of Delivered/Completed orders to the customer's own card,
// so the Order <-> NfcCard relationship has real, visible examples out of
// the box (mirrors what `assignCardToOrder` does at runtime).
for (const order of orders) {
  if (order.status !== "Delivered" && order.status !== "Completed") continue
  const card = nfcCards.find(
    (c) => c.customerId === order.customerId && (c.status === "Active" || c.status === "Assigned"),
  )
  if (card) order.assignedCardId = card.id
}

export const transactions: Transaction[] = orders
  .filter((o) => o.paymentStatus !== "Pending")
  .map((o, i) => ({
    id: `TRX${pad(i + 1, 3)}`,
    orderId: o.id,
    customerId: o.customerId,
    customerName: o.customerName,
    amount: o.total,
    method: o.paymentMethod,
    status: o.paymentStatus,
    date: o.date,
  }))

// Backfill customer aggregate stats now that orders exist.
for (const c of customers) {
  const custOrders = orders.filter((o) => o.customerId === c.id && o.status !== "Cancelled")
  c.totalOrders = custOrders.length
  c.totalSpent = custOrders.reduce((s, o) => s + o.total, 0)
}

// ---------------------------------------------------------------------------
// Analytics + Activity
// ---------------------------------------------------------------------------
const ANALYTICS_COUNT = 500
const ACTIVITY_COUNT = 420
const activeCustomers = customers.filter((_, i) => i < 60) // first 60 customers get most activity
const DEVICES_ANALYTICS = ["Android", "iOS", "Other"] as const
const DEVICES_ACTIVITY = ["Android", "iOS", "Windows", "MacOS"] as const
const ACTIONS: ActivityRecord["action"][] = [
  "Card Tapped",
  "QR Code Scanned",
  "Profile Viewed",
  "Contact Saved",
]
const TRAFFIC_SOURCES: TrafficSource[] = [
  "Direct Tap",
  "Social Media",
  "QR Scan",
  "Search",
  "Referral",
]

export const analyticsRecords: AnalyticsRecord[] = Array.from({ length: ANALYTICS_COUNT }).map(
  (_, i) => {
    const customer = i < 200 ? customers[0] : pick(activeCustomers)
    const daysAgo = faker.number.int({ min: 0, max: 59 })
    return {
      id: `ANL${pad(i + 1, 4)}`,
      customerId: customer.id,
      date: isoDaysAgo(daysAgo).slice(0, 10),
      taps: faker.number.int({ min: 1, max: 18 }),
      qrScans: faker.number.int({ min: 0, max: 10 }),
      profileViews: faker.number.int({ min: 1, max: 25 }),
      uniqueVisitors: faker.number.int({ min: 1, max: 15 }),
      shares: faker.number.int({ min: 0, max: 6 }),
      leads: faker.number.int({ min: 0, max: 4 }),
      device: pick(DEVICES_ANALYTICS),
      location: weightedLocation(),
      source: pick(TRAFFIC_SOURCES),
    }
  },
)

export const activityRecords: ActivityRecord[] = Array.from({ length: ACTIVITY_COUNT })
  .map((_, i) => {
    const customer = i < 150 ? customers[0] : pick(activeCustomers)
    const daysAgo = faker.number.float({ min: 0, max: 45 })
    return {
      id: `ACT${pad(i + 1, 4)}`,
      customerId: customer.id,
      date: isoDaysAgo(daysAgo),
      location: weightedLocation(),
      device: pick(DEVICES_ACTIVITY),
      action: pick(ACTIONS),
    }
  })
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

for (const c of customers) {
  c.totalTaps = activityRecords.filter(
    (a) => a.customerId === c.id && a.action === "Card Tapped",
  ).length
}

// ---------------------------------------------------------------------------
// Support Tickets
// ---------------------------------------------------------------------------
const TICKET_COUNT = 50
const SUBJECTS = [
  "Card not working",
  "Profile not updating",
  "Link not opening",
  "QR code issue",
  "Order not delivered",
  "Need invoice copy",
  "Unable to activate card",
  "Wrong card color received",
  "Payment deducted but order not placed",
  "Request to change username",
]
const PRIORITIES: SupportTicket["priority"][] = ["Low", "Medium", "High"]
const STATUSES: SupportTicket["status"][] = ["Open", "In Progress", "Resolved", "Closed"]

export const supportTickets: SupportTicket[] = Array.from({ length: TICKET_COUNT }).map((_, i) => {
  const customer = i < 8 ? customers[0] : pick(customers)
  const created = isoDaysAgo(faker.number.int({ min: 0, max: 120 }))
  const subject = pick(SUBJECTS)
  const status = pick(STATUSES)
  return {
    id: `TKT${pad(i + 1, 3)}`,
    customerId: customer.id,
    customerName: customer.name,
    subject,
    description: `Hi team, I'm facing an issue: "${subject}". Could you please help me resolve this at the earliest?`,
    priority: pick(PRIORITIES),
    status,
    createdOn: created,
    updatedOn: created,
    messages: [
      { from: "customer", text: `Hi team, I'm facing an issue: "${subject}".`, date: created },
    ],
  }
})
