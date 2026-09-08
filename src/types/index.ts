// Shared domain types for the VR's NEXORA platform.
// This is the single source of truth for shapes used across the public site,
// admin portal and customer portal so a future Django backend can map 1:1.

export type CustomerStatus = "Active" | "Inactive"
// "Assigned" = admin has linked this card to a customer but they haven't
// tapped "Activate" yet (card is physically with them, not yet live).
export type CardStatus = "Active" | "Assigned" | "Inactive" | "Blocked" | "Lost" | "Unassigned"
export type CardType = "Standard" | "Premium" | "Wooden" | "Metal"
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
  customLogo?: string
}

export interface TrackingStep {
  label: string
  date: string | null
  done: boolean
}

export interface Order {
  id: string // ORD001
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
  customLogo?: string | null
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
