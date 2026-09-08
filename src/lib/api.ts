// Centralized API client for the Django backend. Every customer-facing
// page reads/writes through this file — no page should hold its own
// fetch() call or mock data.
import type { CustomField, CustomLink, NfcCard, Profile, Service, SocialLink } from "@/types"

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:8000/api"

const ACCESS_KEY = "nexora_access_token"
const REFRESH_KEY = "nexora_refresh_token"

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}
export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}
export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

// Lets auth-store.ts react when a request discovers the session is
// unrecoverable (refresh token also expired/invalid) without api.ts having
// to import the store directly (which would create a circular import,
// since auth-store.ts already imports from here).
type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null
export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  unauthorizedHandler = handler
}

export class ApiError extends Error {
  status: number
  errors: Record<string, unknown>
  constructor(message: string, status: number, errors: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

export interface PaginationMeta {
  count: number
  page: number
  num_pages: number
  page_size: number
  next: string | null
  previous: string | null
}

interface Envelope<T> {
  success: boolean
  message: string
  data?: T
  errors?: Record<string, unknown>
  pagination?: PaginationMeta
}

let refreshInFlight: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    const refresh = getRefreshToken()
    if (!refresh) return false
    try {
      const res = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      })
      if (!res.ok) return false
      const data = (await res.json()) as { access: string; refresh?: string }
      setTokens(data.access, data.refresh ?? refresh)
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
  auth?: boolean
  isFormData?: boolean
}

/** Network-level failure (server unreachable, DNS, offline, CORS) — distinct
 *  from ApiError, which means "the server responded, but with an error". */
export class NetworkError extends Error {
  constructor() {
    super("Couldn't reach the server. Check your connection and try again.")
  }
}

async function rawRequest<T>(path: string, options: RequestOptions = {}, retried = false): Promise<Envelope<T>> {
  const { method = "GET", body, auth = true, isFormData = false } = options

  const headers: Record<string, string> = {}
  if (!isFormData) headers["Content-Type"] = "application/json"
  if (auth) {
    const token = getAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
    })
  } catch {
    throw new NetworkError()
  }

  if (res.status === 401 && auth) {
    if (!retried && getRefreshToken()) {
      const refreshed = await refreshAccessToken()
      if (refreshed) return rawRequest<T>(path, options, true)
    }
    clearTokens()
    unauthorizedHandler?.()
  }

  let json: Envelope<T> | null = null
  try {
    json = (await res.json()) as Envelope<T>
  } catch {
    json = null
  }

  if (!res.ok || !json || json.success === false) {
    const message = json?.message || `Request failed (${res.status})`
    throw new ApiError(message, res.status, json?.errors ?? {})
  }

  return json
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const json = await rawRequest<T>(path, options)
  return json.data as T
}

async function requestPaginated<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ items: T[]; pagination: PaginationMeta | null }> {
  const json = await rawRequest<T[]>(path, options)
  return { items: (json.data as T[] | undefined) ?? [], pagination: json.pagination ?? null }
}

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------

export interface ApiUser {
  id: number
  email: string
  full_name: string
  phone: string
  role: "ADMIN" | "CUSTOMER"
  avatar: string
  email_verified: boolean
}

interface AuthPayload {
  user: ApiUser
  access: string
  refresh: string
}

export const authApi = {
  register: (data: { full_name: string; email: string; phone?: string; password: string }) =>
    request<AuthPayload>("/auth/register/", { method: "POST", body: data, auth: false }),

  verifyEmail: (data: { email: string; otp: string }) =>
    request<AuthPayload>("/auth/verify-email/", { method: "POST", body: data, auth: false }),

  resendOtp: (data: { email: string; purpose?: "REGISTER" | "RESET" }) =>
    request<null>("/auth/resend-otp/", { method: "POST", body: data, auth: false }),

  login: (data: { email: string; password: string }) =>
    request<AuthPayload>("/auth/login/", { method: "POST", body: data, auth: false }),

  logout: (refresh: string) => request<null>("/auth/logout/", { method: "POST", body: { refresh } }),

  forgotPassword: (data: { email: string }) =>
    request<null>("/auth/forgot-password/", { method: "POST", body: data, auth: false }),

  resetPassword: (data: { email: string; otp: string; new_password: string }) =>
    request<null>("/auth/reset-password/", { method: "POST", body: data, auth: false }),

  changePassword: (data: { current_password: string; new_password: string }) =>
    request<null>("/auth/change-password/", { method: "POST", body: data }),

  me: () => request<ApiUser>("/auth/me/"),

  google: () => request<null>("/auth/google/", { method: "POST", body: {}, auth: false }),
}

// ---------------------------------------------------------------------
// Profile — merges two real backend endpoints that both read/write the
// same underlying Profile row: `/profiles/me/` (social/custom links +
// custom fields, plus the enforced public-visibility flags) and
// `/customer/profile/` (the extended personal/company/address field set +
// image uploads). Adapts both into the frontend's existing `Profile` shape.
// ---------------------------------------------------------------------

interface ApiSocialLink {
  id: number
  platform: SocialLink["platform"]
  url: string
  enabled: boolean
  display_order: number
}
interface ApiCustomLink {
  id: number
  label: string
  url: string
  enabled: boolean
  display_order: number
}
interface ApiCustomField {
  id: number
  label: string
  value: string
  display_order: number
}
interface ApiProfile {
  id: number
  username: string
  full_name: string
  designation: string
  company: string
  email: string
  phone: string
  website: string
  address: string
  bio: string
  avatar: string
  profile_url: string
  status: "ACTIVE" | "SUSPENDED"
  profile_public: boolean
  show_contact_info: boolean
  show_in_search: boolean
  social_links: ApiSocialLink[]
  custom_links: ApiCustomLink[]
  custom_fields: ApiCustomField[]
  created_at: string
}

interface ApiCustomerProfile {
  id: number
  username: string
  full_name: string
  designation: string
  company_name: string
  phone: string
  alternate_phone: string
  email: string
  bio: string
  address: string
  city: string
  state: string
  country: string
  google_maps_url: string
  profile_image: string | null
  cover_image: string | null
  profile_url: string
  status: "ACTIVE" | "SUSPENDED"
  created_at: string
  updated_at: string
}

interface ApiPublicProfile {
  username: string
  full_name: string
  designation: string
  company: string
  email: string | null
  phone: string | null
  website: string
  address: string
  city: string
  state: string
  country: string
  google_maps_url: string
  bio: string
  avatar: string
  cover_image: string | null
  social_links: ApiSocialLink[]
  custom_links: ApiCustomLink[]
  custom_fields: ApiCustomField[]
  services: ApiCustomerService[]
}

interface ApiCustomerService {
  id: number
  title: string
  description: string
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// platform -> backend id, refreshed on every profile fetch.
const socialLinkIdByPlatform = new Map<string, number>()
const customLinkIdCache = new Map<string, number>()
const customFieldIdCache = new Map<string, number>()

function idKey(id: string): number | null {
  const n = Number(id)
  return Number.isInteger(n) ? n : null
}

function toFrontendProfile(p: ApiProfile): Profile {
  socialLinkIdByPlatform.clear()
  customLinkIdCache.clear()
  customFieldIdCache.clear()

  for (const link of p.social_links) socialLinkIdByPlatform.set(link.platform, link.id)
  for (const link of p.custom_links) customLinkIdCache.set(String(link.id), link.id)
  for (const field of p.custom_fields) customFieldIdCache.set(String(field.id), field.id)

  return {
    id: String(p.id),
    customerId: String(p.id),
    username: p.username,
    fullName: p.full_name,
    designation: p.designation,
    company: p.company,
    email: p.email,
    phone: p.phone,
    alternatePhone: "",
    website: p.website,
    address: p.address,
    city: "",
    state: "",
    country: "",
    googleMapsUrl: "",
    bio: p.bio,
    avatar: p.avatar,
    coverImage: null,
    status: p.status === "ACTIVE" ? "Active" : "Suspended",
    createdOn: p.created_at,
    socialLinks: p.social_links
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((l) => ({ platform: l.platform, url: l.url, enabled: l.enabled, order: l.display_order })),
    customLinks: p.custom_links
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((l) => ({ id: String(l.id), label: l.label, url: l.url, enabled: l.enabled, order: l.display_order })),
    customFields: p.custom_fields
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((f) => ({ id: String(f.id), label: f.label, value: f.value, order: f.display_order })),
    services: [],
  }
}

function toFrontendService(s: ApiCustomerService): Service {
  return { id: String(s.id), title: s.title, description: s.description, order: s.display_order, isActive: s.is_active }
}

function mergeExtendedProfile(base: Profile, extended: ApiCustomerProfile): Profile {
  return {
    ...base,
    designation: extended.designation,
    company: extended.company_name,
    phone: extended.phone,
    alternatePhone: extended.alternate_phone,
    bio: extended.bio,
    address: extended.address,
    city: extended.city,
    state: extended.state,
    country: extended.country,
    googleMapsUrl: extended.google_maps_url,
    avatar: extended.profile_image ?? base.avatar,
    coverImage: extended.cover_image,
  }
}

export const profileApi = {
  getMine: async (): Promise<Profile> => {
    const [core, extended, myServices] = await Promise.all([
      request<ApiProfile>("/profiles/me/"),
      request<ApiCustomerProfile>("/customer/profile/"),
      request<ApiCustomerService[]>("/customer/services/"),
    ])
    const merged = mergeExtendedProfile(toFrontendProfile(core), extended)
    merged.services = myServices.slice().sort((a, b) => a.display_order - b.display_order).map(toFrontendService)
    return merged
  },

  updateMine: async (patch: {
    fullName?: string
    designation?: string
    company?: string
    phone?: string
    alternatePhone?: string
    website?: string
    address?: string
    city?: string
    state?: string
    country?: string
    googleMapsUrl?: string
    bio?: string
  }): Promise<Profile> => {
    const body: Record<string, unknown> = {}
    if (patch.fullName !== undefined) body.full_name = patch.fullName
    if (patch.designation !== undefined) body.designation = patch.designation
    if (patch.company !== undefined) body.company_name = patch.company
    if (patch.phone !== undefined) body.phone = patch.phone
    if (patch.alternatePhone !== undefined) body.alternate_phone = patch.alternatePhone
    if (patch.address !== undefined) body.address = patch.address
    if (patch.city !== undefined) body.city = patch.city
    if (patch.state !== undefined) body.state = patch.state
    if (patch.country !== undefined) body.country = patch.country
    if (patch.googleMapsUrl !== undefined) body.google_maps_url = patch.googleMapsUrl
    if (patch.bio !== undefined) body.bio = patch.bio

    await request<ApiCustomerProfile>("/customer/profile/", { method: "PUT", body })

    // `website` isn't part of the customer_profiles field set — it still
    // lives on the original profiles.Profile serializer.
    if (patch.website !== undefined) {
      await request<ApiProfile>("/profiles/me/", { method: "PATCH", body: { website: patch.website } })
    }

    return profileApi.getMine()
  },

  getPrivacySettings: async () => {
    const p = await request<ApiProfile>("/profiles/me/")
    return {
      profilePublic: p.profile_public,
      showContactInfo: p.show_contact_info,
      showInSearch: p.show_in_search,
    }
  },

  updatePrivacySettings: (patch: { profilePublic?: boolean; showContactInfo?: boolean; showInSearch?: boolean }) => {
    const body: Record<string, unknown> = {}
    if (patch.profilePublic !== undefined) body.profile_public = patch.profilePublic
    if (patch.showContactInfo !== undefined) body.show_contact_info = patch.showContactInfo
    if (patch.showInSearch !== undefined) body.show_in_search = patch.showInSearch
    return request<ApiProfile>("/profiles/me/", { method: "PATCH", body })
  },

  uploadProfileImage: async (file: File): Promise<Profile> => {
    const formData = new FormData()
    formData.append("image", file)
    await request<ApiCustomerProfile>("/customer/profile/upload-image/", {
      method: "POST",
      body: formData,
      isFormData: true,
    })
    return profileApi.getMine()
  },

  uploadCoverImage: async (file: File): Promise<Profile> => {
    const formData = new FormData()
    formData.append("image", file)
    await request<ApiCustomerProfile>("/customer/profile/upload-cover/", {
      method: "POST",
      body: formData,
      isFormData: true,
    })
    return profileApi.getMine()
  },

  getPublic: async (username: string): Promise<Profile | null> => {
    try {
      const p = await request<ApiPublicProfile>(`/profiles/public/${encodeURIComponent(username)}/`, { auth: false })
      return {
        id: p.username,
        customerId: p.username,
        username: p.username,
        fullName: p.full_name,
        designation: p.designation,
        company: p.company,
        email: p.email ?? "",
        phone: p.phone ?? "",
        alternatePhone: "",
        website: p.website,
        address: p.address,
        city: p.city,
        state: p.state,
        country: p.country,
        googleMapsUrl: p.google_maps_url,
        bio: p.bio,
        avatar: p.avatar,
        coverImage: p.cover_image,
        status: "Active",
        createdOn: "",
        socialLinks: p.social_links
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map((l) => ({ platform: l.platform, url: l.url, enabled: l.enabled, order: l.display_order })),
        customLinks: p.custom_links
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map((l) => ({ id: String(l.id), label: l.label, url: l.url, enabled: l.enabled, order: l.display_order })),
        customFields: p.custom_fields
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map((f) => ({ id: String(f.id), label: f.label, value: f.value, order: f.display_order })),
        services: p.services
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map(toFrontendService),
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  },

  // --- Social links: bulk get/replace against the customer_management
  // endpoint — no id tracking needed, the backend upserts by platform. ---
  saveSocialLinks: (links: SocialLink[]) =>
    request("/customer/social-links/", {
      method: "PUT",
      body: {
        links: links.map((l) => ({
          platform: l.platform,
          url: l.url,
          enabled: l.enabled,
          display_order: l.order,
        })),
      },
    }),

  // --- Custom links: full sync (create/update/delete/reorder) against the
  // desired list, diffing against the id cache built by the last fetch. ---
  saveCustomLinks: async (links: CustomLink[]) => {
    const desiredIds = new Set(links.map((l) => idKey(l.id)).filter((v): v is number => v !== null))
    const toDelete = Array.from(customLinkIdCache.values()).filter((id) => !desiredIds.has(id))
    await Promise.all(toDelete.map((id) => request(`/profiles/custom-links/${id}/`, { method: "DELETE" })))

    const resolvedIds: number[] = []
    for (const link of links) {
      const existingId = idKey(link.id)
      if (existingId !== null && customLinkIdCache.has(link.id)) {
        await request(`/profiles/custom-links/${existingId}/`, {
          method: "PATCH",
          body: { label: link.label, url: link.url, enabled: link.enabled },
        })
        resolvedIds.push(existingId)
      } else {
        const created = await request<ApiCustomLink>("/profiles/custom-links/", {
          method: "POST",
          body: { label: link.label, url: link.url, enabled: link.enabled },
        })
        resolvedIds.push(created.id)
      }
    }
    if (resolvedIds.length) {
      await request("/profiles/custom-links/reorder/", { method: "PATCH", body: { order: resolvedIds } })
    }
  },

  // --- Custom fields: same full-sync pattern as custom links. ---
  saveCustomFields: async (fields: CustomField[]) => {
    const desiredIds = new Set(fields.map((f) => idKey(f.id)).filter((v): v is number => v !== null))
    const toDelete = Array.from(customFieldIdCache.values()).filter((id) => !desiredIds.has(id))
    await Promise.all(toDelete.map((id) => request(`/profiles/custom-fields/${id}/`, { method: "DELETE" })))

    const resolvedIds: number[] = []
    for (const field of fields) {
      const existingId = idKey(field.id)
      if (existingId !== null && customFieldIdCache.has(field.id)) {
        await request(`/profiles/custom-fields/${existingId}/`, {
          method: "PATCH",
          body: { label: field.label, value: field.value },
        })
        resolvedIds.push(existingId)
      } else {
        const created = await request<ApiCustomField>("/profiles/custom-fields/", {
          method: "POST",
          body: { label: field.label, value: field.value },
        })
        resolvedIds.push(created.id)
      }
    }
    if (resolvedIds.length) {
      await request("/profiles/custom-fields/reorder/", { method: "PATCH", body: { order: resolvedIds } })
    }
  },
}

// ---------------------------------------------------------------------
// Services — showcased on the public profile page.
// ---------------------------------------------------------------------

export const servicesApi = {
  list: async (): Promise<Service[]> =>
    (await request<ApiCustomerService[]>("/customer/services/"))
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map(toFrontendService),

  create: async (data: { title: string; description: string }): Promise<Service> =>
    toFrontendService(
      await request<ApiCustomerService>("/customer/services/", {
        method: "POST",
        body: { title: data.title, description: data.description },
      }),
    ),

  update: async (id: string, patch: { title?: string; description?: string; isActive?: boolean }): Promise<Service> => {
    const body: Record<string, unknown> = {}
    if (patch.title !== undefined) body.title = patch.title
    if (patch.description !== undefined) body.description = patch.description
    if (patch.isActive !== undefined) body.is_active = patch.isActive
    return toFrontendService(
      await request<ApiCustomerService>(`/customer/services/${id}/`, { method: "PATCH", body }),
    )
  },

  remove: (id: string) => request(`/customer/services/${id}/`, { method: "DELETE" }),

  reorder: (orderedIds: string[]) =>
    request("/customer/services/reorder/", {
      method: "PATCH",
      body: { order: orderedIds.map((id) => Number(id)) },
    }),
}

// ---------------------------------------------------------------------
// NFC cards
// ---------------------------------------------------------------------

export interface ApiNfcCard {
  id: number
  uid: string
  serial_number: string
  card_type: string
  color: string
  status: string
  customer_name: string | null
  assigned_on: string | null
  activated_on: string | null
  purchase_date: string | null
  notes: string
}

const CARD_TYPE_MAP: Record<string, NfcCard["cardType"]> = {
  STANDARD: "Standard",
  PREMIUM: "Premium",
  WOODEN: "Wooden",
  METAL: "Metal",
}
const CARD_STATUS_MAP: Record<string, NfcCard["status"]> = {
  ACTIVE: "Active",
  ASSIGNED: "Assigned",
  INACTIVE: "Inactive",
  BLOCKED: "Blocked",
  LOST: "Lost",
  UNASSIGNED: "Unassigned",
}

export function toFrontendCard(c: ApiNfcCard): NfcCard {
  return {
    id: String(c.id),
    uid: c.uid,
    serialNumber: c.serial_number,
    cardType: CARD_TYPE_MAP[c.card_type] ?? "Standard",
    color: c.color,
    customerId: null,
    customerName: c.customer_name,
    status: CARD_STATUS_MAP[c.status] ?? "Unassigned",
    assignedOn: c.assigned_on,
    activatedOn: c.activated_on,
    purchaseDate: c.purchase_date ?? "",
    notes: c.notes,
  }
}

export const nfcApi = {
  mine: async (): Promise<NfcCard[]> => (await request<ApiNfcCard[]>("/nfc/my-card/")).map(toFrontendCard),

  activate: async (uid: string): Promise<NfcCard> =>
    toFrontendCard(await request<ApiNfcCard>("/nfc/activate/", { method: "POST", body: { uid } })),

  deactivate: async (uid: string): Promise<NfcCard> =>
    toFrontendCard(await request<ApiNfcCard>("/nfc/deactivate/", { method: "POST", body: { uid } })),

  activateAssigned: async (id: string): Promise<NfcCard> =>
    toFrontendCard(await request<ApiNfcCard>(`/nfc/cards/${id}/activate-assigned/`, { method: "POST" })),

  resolve: (identifier: string) =>
    request<{ redirect_url: string }>(`/nfc/cards/${encodeURIComponent(identifier)}/`, { auth: false }),
}

// ---------------------------------------------------------------------
// QR code
// ---------------------------------------------------------------------

export interface ApiQrCode {
  id: number
  image: string
  target_url: string
  created_at: string
  updated_at: string
}

export const qrApi = {
  get: async (): Promise<ApiQrCode | null> => {
    try {
      return await request<ApiQrCode>("/customer/qr/")
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  },
  generate: () => request<ApiQrCode>("/customer/qr/generate/", { method: "POST" }),
  regenerate: () => request<ApiQrCode>("/customer/qr/regenerate/", { method: "POST" }),
  /** Fetches the existing QR, generating one on first use. */
  getOrCreate: async (): Promise<ApiQrCode> => (await qrApi.get()) ?? qrApi.generate(),
}

// ---------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------

export interface ApiAnalyticsEvent {
  id: number
  event_type: "PROFILE_VIEW" | "NFC_TAP" | "QR_SCAN" | "SOCIAL_CLICK"
  device: string
  ip_address: string | null
  source: string
  metadata: string
  created_at: string
}

interface PeriodBreakdown {
  today: number
  week: number
  month: number
  year: number
}

export interface ApiAnalyticsSummary {
  profile_views: PeriodBreakdown
  nfc_taps: PeriodBreakdown
  qr_scans: PeriodBreakdown
  social_clicks: PeriodBreakdown
  totals: { profile_views: number; nfc_taps: number; qr_scans: number; social_clicks: number }
}

export interface ApiAnalyticsOverview {
  totals: ApiAnalyticsSummary["totals"]
  recent: ApiAnalyticsEvent[]
}

export const analyticsApi = {
  getOverview: () => request<ApiAnalyticsOverview>("/customer/analytics/"),
  getSummary: () => request<ApiAnalyticsSummary>("/customer/analytics/summary/"),
  getViews: (page = 1, pageSize = 100) =>
    requestPaginated<ApiAnalyticsEvent>(`/customer/analytics/views/?page=${page}&page_size=${pageSize}`),
  getTaps: (page = 1, pageSize = 100) =>
    requestPaginated<ApiAnalyticsEvent>(`/customer/analytics/taps/?page=${page}&page_size=${pageSize}`),
  getScans: (page = 1, pageSize = 100) =>
    requestPaginated<ApiAnalyticsEvent>(`/customer/analytics/scans/?page=${page}&page_size=${pageSize}`),
}

// ---------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------

export interface ApiOrderItem {
  id: number
  card_type: string
  color: string
  quantity: number
  unit_price: string
  line_total: string
}
export interface ApiOrderStatusHistory {
  status: string
  note: string
  created_at: string
}
export interface ApiOrder {
  id: number
  order_number: string
  status: string
  shipping_full_name: string
  shipping_phone: string
  shipping_address: string
  shipping_city: string
  shipping_state: string
  shipping_country: string
  shipping_postal_code: string
  subtotal: string
  discount: string
  total: string
  tracking_number: string
  notes: string
  items: ApiOrderItem[]
  status_history: ApiOrderStatusHistory[]
  created_at: string
  updated_at: string
}

export interface CreateOrderPayload {
  shipping_full_name: string
  shipping_phone: string
  shipping_address: string
  shipping_city: string
  shipping_state: string
  shipping_country: string
  shipping_postal_code: string
  notes?: string
  discount?: number
  items: { card_type: string; color: string; quantity: number; unit_price: number }[]
}

export const ordersApi = {
  list: (page = 1) => requestPaginated<ApiOrder>(`/customer/orders/?page=${page}`),
  create: (payload: CreateOrderPayload) => request<ApiOrder>("/customer/orders/", { method: "POST", body: payload }),
  getById: (id: number | string) => request<ApiOrder>(`/customer/orders/${id}/`),
}

// ---------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------

export interface ApiLead {
  id: number
  name: string
  email: string
  phone: string
  company: string
  message: string
  created_at: string
}

export const leadsApi = {
  list: (page = 1, search = "") =>
    requestPaginated<ApiLead>(`/customer/leads/?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
}

// ---------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------

export interface ApiNotification {
  id: number
  title: string
  message: string
  type: "ORDER_UPDATE" | "NFC_UPDATE" | "PROFILE_VIEW" | "SYSTEM_MESSAGE"
  is_read: boolean
  created_at: string
}

export const notificationsApi = {
  list: (page = 1, unreadOnly = false) =>
    requestPaginated<ApiNotification>(`/customer/notifications/?page=${page}${unreadOnly ? "&unread_only=true" : ""}`),
  markRead: (payload: { ids?: number[]; all?: boolean }) =>
    request<{ updated: number }>("/customer/notifications/read/", { method: "POST", body: payload }),
}

// ---------------------------------------------------------------------
// Customer settings — notification/language/timezone preferences. (The
// *enforced* public-profile privacy toggles are still `profileApi.get/
// updatePrivacySettings` above — these are a separate preference set.)
// ---------------------------------------------------------------------

export interface ApiCustomerSettings {
  id: number
  show_email: boolean
  show_phone: boolean
  show_company: boolean
  show_social_links: boolean
  language: string
  timezone: string
  notify_order_updates: boolean
  notify_nfc_updates: boolean
  notify_profile_views: boolean
  notify_system_messages: boolean
  updated_at: string
}

export const customerSettingsApi = {
  getMine: () => request<ApiCustomerSettings>("/customer/settings/"),
  updateMine: (patch: Partial<Omit<ApiCustomerSettings, "id" | "updated_at">>) =>
    request<ApiCustomerSettings>("/customer/settings/", { method: "PUT", body: patch }),
}

// ---------------------------------------------------------------------
// Dashboard — one aggregated call for the overview page.
// ---------------------------------------------------------------------

export interface ApiDashboard {
  totals: {
    profile_views: number
    nfc_taps: number
    qr_scans: number
    leads: number
    orders: number
  }
  nfc_cards: ApiNfcCard[]
  recent_notifications: ApiNotification[]
  recent_activity: ApiAnalyticsEvent[]
}

export const dashboardApi = {
  get: () => request<ApiDashboard>("/customer/dashboard/"),
}
