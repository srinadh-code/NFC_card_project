// Shared domain types for the VR's NEXORA platform.
// This is the single source of truth for shapes used across the public site,
// admin portal and customer portal so a future Django backend can map 1:1.

export type CustomerStatus = "Active" | "Inactive"
// "Assigned" = admin has linked this card to a customer but they haven't
// tapped "Activate" yet (card is physically with them, not yet live).
export type CardStatus = "Active" | "Assigned" | "Inactive" | "Blocked" | "Lost" | "Unassigned"
// Classic and Premium are retired — deleted from the backend enum and
// purged from existing records, so they're no longer valid values here.
// "Review" is the Google Review Card — a public-site-only product, not an
// NfcCard inventory type (see orders.serializers.GOOGLE_REVIEW_CARD_TYPE on
// the backend), used only on OrderItem/CartLine, never on NfcCard.
export type CardType = "Wooden" | "Custom" | "Review"
export type ProfileStatus = "Active" | "Suspended"

export type OrderStatus =
  | "Pending"
  | "Processing"
  | "Shipped"
  | "Delivered"
  | "Completed"
  | "Cancelled"
export type PaymentStatus = "Paid" | "Refunded" | "Failed" | "Pending"
export type PaymentMethod = "UPI" | "Card" | "Net Banking" | "Razorpay" | "COD"

export type TicketStatus = "Open" | "In Progress" | "Resolved" | "Closed"
export type TicketPriority = "Low" | "Medium" | "High"

export interface Address {
  line1: string
  city: string
  state: string
  pincode: string
  country: string
}

export interface Customer {
  id: string // CUS001
  name: string
  email: string
  phone: string
  company: string
  designation: string
  address: Address
  profileUrl: string // vrsnexora.com/u/username
  username: string
  status: CustomerStatus
  avatar: string
  joinedOn: string // ISO date
  totalOrders: number
  totalSpent: number
  totalTaps: number
}

export interface NfcCard {
  id: string // NFC1001
  uid: string // 04AABBCC0001
  serialNumber: string
  cardType: CardType
  color: string
  customerId: string | null
  customerName: string | null
  // Only populated by the admin card endpoints (@/lib/api adminNfcApi) —
  // used to prefill the assign dialog with the currently-assigned customer.
  customerEmail?: string | null
  status: CardStatus
  assignedOn: string | null
  activatedOn: string | null
  purchaseDate: string
  notes?: string
}

export interface OrderItem {
  productId: string
  name: string
  cardType: CardType
  color: string
  qty: number
  price: number
}

export interface TrackingStep {
  label: string
  date: string | null
  done: boolean
}

// A customer's saved delivery address (the "address book") — entirely
// customer-controlled, purely CUSTOMER → DELIVERY/TO. Never confused with
// the admin-controlled office/dispatch address (see
// lib/order-tracking.ts's OfficeAddress, ADMIN → DISPATCH/FROM). An order
// never holds a live reference to one of these — see Order.address below,
// which is a one-time snapshot copied from whichever CustomerAddress was
// selected at checkout, so editing/deleting this row later never changes
// any existing order's delivery address.
export interface CustomerAddress {
  id: string
  label: string
  fullName: string
  phone: string
  addressLine1: string
  addressLine2: string
  landmark: string
  locality: string
  city: string
  district: string
  state: string
  pincode: string
  country: string
  isDefault: boolean
}

export interface Order {
  id: string // internal numeric id — used for admin/customer API calls (status update, card assignment, detail fetch)
  // The real public order code (e.g. "NXTRK250344") — see Order.generate_order_number
  // on the backend. This is what customers/admin should see and share as
  // "the Order ID"; `id` above stays purely an internal lookup key. Null
  // only in the moment before a fresh order's first save (never null once
  // it comes back from any real API response).
  orderNumber: string | null
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone: string
  items: OrderItem[]
  amount: number
  shipping: number
  total: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  status: OrderStatus
  date: string
  address: Address
  tracking: TrackingStep[]
  // Set once admin assigns a physical NFC card to fulfill this order.
  assignedCardId: string | null
}

export interface Transaction {
  id: string // TRX001
  orderId: string
  customerId: string
  customerName: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  date: string
}

export type SocialPlatform =
  | "LinkedIn"
  | "Instagram"
  | "Facebook"
  | "WhatsApp"
  | "YouTube"
  | "Twitter"
  | "GitHub"
  | "Telegram"
  | "Website"

export interface SocialLink {
  platform: SocialPlatform
  url: string
  enabled: boolean
  order: number
}

export interface CustomLink {
  id: string // CLK001
  label: string
  url: string
  enabled: boolean
  order: number
}

export interface CustomField {
  id: string // FLD001
  label: string
  value: string
  order: number
}

export interface Service {
  id: string
  title: string
  description: string
  order: number
  isActive: boolean
}

export interface Profile {
  id: string // PRO001
  customerId: string
  username: string
  fullName: string
  designation: string
  company: string
  email: string
  phone: string
  alternatePhone: string
  website: string
  address: string
  city: string
  state: string
  country: string
  googleMapsUrl: string
  bio: string
  avatar: string
  coverImage: string | null
  status: ProfileStatus
  createdOn: string
  // Which profile-card visual template this customer has chosen, the plan
  // that entitlement is derived from, and the full set of template ids
  // their plan allows picking from. Not present on a public-profile fetch
  // except `selectedTemplate` (plan/entitlement are owner-only concerns).
  selectedTemplate: string
  // Color variant for Template 1 ("luxury") only — ignored by every other
  // template. Same component, same data; only styling changes per variant.
  luxuryTheme: "green" | "blue" | "black"
  // Color variant for Template 2 ("future") only — same idea as
  // luxuryTheme above, independent of it.
  futureTheme: "green" | "blue" | "black"
  // Color variant for "Impact" only — same idea as luxuryTheme/futureTheme.
  impactTheme: "red" | "blue" | "black" | "white"
  // Color variant for "Glass" only — same idea as the other *Theme fields.
  glassTheme: "white" | "blue" | "green"
  plan?: string
  availableTemplates?: string[]
  socialLinks: SocialLink[]
  customLinks: CustomLink[]
  customFields: CustomField[]
  services: Service[]
}

export interface ActivityRecord {
  id: string
  customerId: string
  date: string // ISO datetime
  location: string
  device: "Android" | "iOS" | "Windows" | "MacOS"
  action: "Card Tapped" | "QR Code Scanned" | "Profile Viewed" | "Contact Saved"
}

export type TrafficSource = "Direct Tap" | "Social Media" | "QR Scan" | "Search" | "Referral"

export interface AnalyticsRecord {
  id: string
  customerId: string
  date: string // ISO date, day granularity
  taps: number
  qrScans: number
  profileViews: number
  uniqueVisitors: number
  shares: number
  leads: number
  device: "Android" | "iOS" | "Other"
  location: string
  source: TrafficSource
}

export interface SupportTicket {
  id: string // TKT001
  customerId: string
  customerName: string
  subject: string
  description: string
  priority: TicketPriority
  status: TicketStatus
  createdOn: string
  updatedOn: string
  messages: { from: "customer" | "support"; text: string; date: string }[]
}

export interface Product {
  id: string
  name: string
  cardType: CardType
  description: string
  price: number
  colors: { name: string; hex: string }[]
  image: string
  popular?: boolean
}

export interface CartLine {
  lineId: string
  productId: string
  name: string
  cardType: CardType
  color: { name: string; hex: string }
  qty: number
  price: number
}

export interface AdminUser {
  name: string
  email: string
  role: "Super Admin"
  avatar: string
}

export interface CustomerUser {
  id: string
  name: string
  email: string
  avatar: string
}

export interface Testimonial {
  id: string
  name: string
  role: string
  company: string
  avatar: string
  rating: number
  quote: string
}

export type ThemeMode = "light" | "dark" | "system"
