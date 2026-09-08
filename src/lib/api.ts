// Centralized API client for the Django backend. Every customer-facing
// page reads/writes through this file — no page should hold its own
// fetch() call or mock data.
import type {
  Address,
  CustomField,
  CustomLink,
  NfcCard,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Profile,
  Service,
  SocialLink,
  SupportTicket,
  TicketPriority,
  TicketStatus,
  Transaction,
  TrackingStep,
} from "@/types"

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
  // Server-computed convenience field ("/admin/dashboard" or "/dashboard")
  // — the frontend still derives its own redirect from `user.role` via
  // hasValidSession()/performLogin() in auth-store.ts, so this is
  // informational only, not currently consumed for routing decisions.
  dashboard_url: string
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

interface ApiCustomerService {
  id: number
  title: string
  description: string
  display_order: number
  is_active: boolean
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
// NFC cards — admin inventory management
// ---------------------------------------------------------------------

interface ApiAdminNfcCard extends ApiNfcCard {
  customer_id: number | null
  customer_email: string | null
}

const CARD_TYPE_REVERSE_MAP: Record<NfcCard["cardType"], string> = {
  Standard: "STANDARD",
  Premium: "PREMIUM",
  Wooden: "WOODEN",
  Metal: "METAL",
}
const CARD_STATUS_REVERSE_MAP: Record<NfcCard["status"], string> = {
  Active: "ACTIVE",
  Assigned: "ASSIGNED",
  Inactive: "INACTIVE",
  Blocked: "BLOCKED",
  Lost: "LOST",
  Unassigned: "UNASSIGNED",
}

function toFrontendAdminCard(c: ApiAdminNfcCard): NfcCard {
  return {
    ...toFrontendCard(c),
    customerId: c.customer_id !== null ? String(c.customer_id) : null,
    customerEmail: c.customer_email,
  }
}

export interface AdminCardWrite {
  uid?: string
  serialNumber?: string
  cardType?: NfcCard["cardType"]
  color?: string
  status?: NfcCard["status"]
  purchaseDate?: string
  notes?: string
  customerEmail?: string
}

function toApiCardPayload(values: AdminCardWrite): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (values.uid !== undefined) body.uid = values.uid
  if (values.serialNumber !== undefined) body.serial_number = values.serialNumber
  if (values.cardType !== undefined) body.card_type = CARD_TYPE_REVERSE_MAP[values.cardType]
  if (values.color !== undefined) body.color = values.color
  if (values.status !== undefined) body.status = CARD_STATUS_REVERSE_MAP[values.status]
  if (values.purchaseDate !== undefined) body.purchase_date = values.purchaseDate || null
  if (values.notes !== undefined) body.notes = values.notes
  if (values.customerEmail !== undefined) body.customer_email = values.customerEmail
  return body
}

export interface AdminCardPage {
  data: NfcCard[]
  count: number
  page: number
  numPages: number
}

export const adminNfcApi = {
  list: async (params: { page?: number; search?: string; status?: NfcCard["status"] | "All" }): Promise<AdminCardPage> => {
    const qs = new URLSearchParams()
    if (params.page) qs.set("page", String(params.page))
    if (params.search) qs.set("search", params.search)
    if (params.status && params.status !== "All") qs.set("status", CARD_STATUS_REVERSE_MAP[params.status])
    const query = qs.toString()
    const envelope = await rawRequest<ApiAdminNfcCard[]>(`/nfc/admin/cards/${query ? `?${query}` : ""}`)
    return {
      data: (envelope.data ?? []).map(toFrontendAdminCard),
      count: envelope.pagination?.count ?? 0,
      page: envelope.pagination?.page ?? 1,
      numPages: envelope.pagination?.num_pages ?? 1,
    }
  },

  create: async (values: AdminCardWrite): Promise<NfcCard> =>
    toFrontendAdminCard(
      await request<ApiAdminNfcCard>("/nfc/admin/cards/", { method: "POST", body: toApiCardPayload(values) }),
    ),

  update: async (id: string, values: AdminCardWrite): Promise<NfcCard> =>
    toFrontendAdminCard(
      await request<ApiAdminNfcCard>(`/nfc/admin/cards/${id}/`, {
        method: "PATCH",
        body: toApiCardPayload(values),
      }),
    ),

  remove: (id: string) => request<null>(`/nfc/admin/cards/${id}/`, { method: "DELETE" }),

  assign: async (id: string, email: string): Promise<NfcCard> =>
    toFrontendAdminCard(
      await request<ApiAdminNfcCard>(`/nfc/admin/cards/${id}/assign/`, { method: "POST", body: { email } }),
    ),

  activate: async (id: string): Promise<NfcCard> =>
    toFrontendAdminCard(await request<ApiAdminNfcCard>(`/nfc/admin/cards/${id}/activate/`, { method: "POST" })),

  block: async (id: string): Promise<NfcCard> =>
    toFrontendAdminCard(await request<ApiAdminNfcCard>(`/nfc/admin/cards/${id}/block/`, { method: "POST" })),

  markLost: async (id: string): Promise<NfcCard> =>
    toFrontendAdminCard(await request<ApiAdminNfcCard>(`/nfc/admin/cards/${id}/mark-lost/`, { method: "POST" })),
}

// ---------------------------------------------------------------------
// Admin customer directory
// ---------------------------------------------------------------------

interface ApiAdminCustomerListItem {
  id: number
  name: string
  email: string
  phone: string
  company: string
  designation: string
  username: string
  status: "Active" | "Inactive"
  avatar: string
  joined_on: string
  card_count: number
}

interface ApiNfcCardMini {
  id: number
  uid: string
  serial_number: string
  card_type: string
  color: string
  status: string
  assigned_on: string | null
  activated_on: string | null
  purchase_date: string | null
}

interface ApiAdminCustomerDetail extends ApiAdminCustomerListItem {
  website: string
  address: string
  bio: string
  profile_status: "ACTIVE" | "SUSPENDED"
  social_links: ApiSocialLink[]
  cards: ApiNfcCardMini[]
}

export interface AdminCustomerListItem {
  id: string
  name: string
  email: string
  phone: string
  company: string
  designation: string
  username: string
  status: "Active" | "Inactive"
  avatar: string
  joinedOn: string
  cardCount: number
}

export interface AdminCustomerDetail extends AdminCustomerListItem {
  website: string
  address: string
  bio: string
  profileStatus: "Active" | "Suspended"
  socialLinks: SocialLink[]
  cards: NfcCard[]
}

function toFrontendCustomerListItem(c: ApiAdminCustomerListItem): AdminCustomerListItem {
  return {
    id: String(c.id),
    name: c.name,
    email: c.email,
    phone: c.phone,
    company: c.company,
    designation: c.designation,
    username: c.username,
    status: c.status,
    avatar: c.avatar,
    joinedOn: c.joined_on,
    cardCount: c.card_count,
  }
}

function toFrontendMiniCard(c: ApiNfcCardMini, customerId: string, customerName: string): NfcCard {
  return {
    id: String(c.id),
    uid: c.uid,
    serialNumber: c.serial_number,
    cardType: CARD_TYPE_MAP[c.card_type] ?? "Standard",
    color: c.color,
    customerId,
    customerName,
    status: CARD_STATUS_MAP[c.status] ?? "Unassigned",
    assignedOn: c.assigned_on,
    activatedOn: c.activated_on,
    purchaseDate: c.purchase_date ?? "",
  }
}

export interface AdminCustomerPage {
  data: AdminCustomerListItem[]
  count: number
  page: number
  numPages: number
}

export const adminCustomerApi = {
  list: async (params: {
    page?: number
    search?: string
    status?: "Active" | "Inactive" | "All"
  }): Promise<AdminCustomerPage> => {
    const qs = new URLSearchParams()
    if (params.page) qs.set("page", String(params.page))
    if (params.search) qs.set("search", params.search)
    if (params.status && params.status !== "All") qs.set("status", params.status)
    const query = qs.toString()
    const envelope = await rawRequest<ApiAdminCustomerListItem[]>(
      `/profiles/admin/customers/${query ? `?${query}` : ""}`,
    )
    return {
      data: (envelope.data ?? []).map(toFrontendCustomerListItem),
      count: envelope.pagination?.count ?? 0,
      page: envelope.pagination?.page ?? 1,
      numPages: envelope.pagination?.num_pages ?? 1,
    }
  },

  get: async (id: string): Promise<AdminCustomerDetail> => {
    const c = await request<ApiAdminCustomerDetail>(`/profiles/admin/customers/${id}/`)
    return {
      ...toFrontendCustomerListItem(c),
      website: c.website,
      address: c.address,
      bio: c.bio,
      profileStatus: c.profile_status === "ACTIVE" ? "Active" : "Suspended",
      socialLinks: c.social_links
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
        .map((l) => ({ platform: l.platform, url: l.url, enabled: l.enabled, order: l.display_order })),
      cards: c.cards.map((card) => toFrontendMiniCard(card, String(c.id), c.name)),
    }
  },
}

// ---------------------------------------------------------------------
// Shared order/payment enum mappings (admin_api + customer_management
// both use these UPPER_CASE backend enums for the same domain concepts).
// ---------------------------------------------------------------------

const ORDER_STATUS_MAP: Record<string, OrderStatus> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
}
const ORDER_STATUS_REVERSE_MAP: Record<OrderStatus, string> = {
  Pending: "PENDING",
  Processing: "PROCESSING",
  Shipped: "SHIPPED",
  Delivered: "DELIVERED",
  Completed: "COMPLETED",
  Cancelled: "CANCELLED",
}
const PAYMENT_METHOD_MAP: Record<string, PaymentMethod> = {
  UPI: "UPI",
  CARD: "Card",
  NET_BANKING: "Net Banking",
  RAZORPAY: "Razorpay",
  COD: "COD",
}
const PAYMENT_METHOD_REVERSE_MAP: Record<PaymentMethod, string> = {
  UPI: "UPI",
  Card: "CARD",
  "Net Banking": "NET_BANKING",
  Razorpay: "RAZORPAY",
  COD: "COD",
}
const PAYMENT_STATUS_MAP: Record<string, PaymentStatus> = {
  PAID: "Paid",
  REFUNDED: "Refunded",
  FAILED: "Failed",
  PENDING: "Pending",
}
const PAYMENT_STATUS_REVERSE_MAP: Record<PaymentStatus, string> = {
  Paid: "PAID",
  Refunded: "REFUNDED",
  Failed: "FAILED",
  Pending: "PENDING",
}
const TICKET_STATUS_MAP: Record<string, TicketStatus> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
}
const TICKET_STATUS_REVERSE_MAP: Record<TicketStatus, string> = {
  Open: "OPEN",
  "In Progress": "IN_PROGRESS",
  Resolved: "RESOLVED",
  Closed: "CLOSED",
}
const TICKET_PRIORITY_MAP: Record<string, TicketPriority> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
}
const TICKET_PRIORITY_REVERSE_MAP: Record<TicketPriority, string> = {
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
}

// ---------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------

interface ApiAdminDashboard {
  total_customers: number
  active_customers: number
  total_cards: number
  activated_cards: number
  total_orders: number
  pending_orders: number
  total_revenue: number
  todays_revenue: number
  customer_trend: number
  order_trend: number
  revenue_trend: number
  card_trend: number
  recent_orders: { id: number; customer_name: string; total: number; status: string; date: string }[]
}

export interface AdminDashboardStats {
  totalCustomers: number
  activeCustomers: number
  totalCards: number
  activatedCards: number
  totalOrders: number
  pendingOrders: number
  totalRevenue: number
  todaysRevenue: number
  customerTrend: number
  orderTrend: number
  revenueTrend: number
  cardTrend: number
  recentOrders: { id: string; customerName: string; total: number; status: OrderStatus; date: string }[]
}

export const adminDashboardApi = {
  get: async (): Promise<AdminDashboardStats> => {
    const d = await request<ApiAdminDashboard>("/admin/dashboard/")
    return {
      totalCustomers: d.total_customers,
      activeCustomers: d.active_customers,
      totalCards: d.total_cards,
      activatedCards: d.activated_cards,
      totalOrders: d.total_orders,
      pendingOrders: d.pending_orders,
      totalRevenue: d.total_revenue,
      todaysRevenue: d.todays_revenue,
      customerTrend: d.customer_trend,
      orderTrend: d.order_trend,
      revenueTrend: d.revenue_trend,
      cardTrend: d.card_trend,
      recentOrders: d.recent_orders.map((o) => ({
        id: String(o.id),
        customerName: o.customer_name,
        total: o.total,
        status: ORDER_STATUS_MAP[o.status] ?? "Pending",
        date: o.date,
      })),
    }
  },
}

// ---------------------------------------------------------------------
// Admin orders
// ---------------------------------------------------------------------

interface ApiAdminOrderItem {
  product_id: string
  name: string
  card_type: string
  color: string
  qty: number
  price: string
}
interface ApiAdminOrder {
  id: number
  customer_id: number
  customer_name: string
  customer_email: string
  customer_phone: string
  items: ApiAdminOrderItem[]
  amount: string
  shipping: string
  total: string
  payment_method: string
  payment_status: string
  status: string
  address: Address
  tracking: { label: string; date: string | null; done: boolean }[]
  assigned_card_id: number | null
  placed_at: string
}

function toFrontendOrder(o: ApiAdminOrder): Order {
  return {
    id: String(o.id),
    customerId: String(o.customer_id),
    customerName: o.customer_name,
    customerEmail: o.customer_email,
    customerPhone: o.customer_phone,
    items: o.items.map((it) => ({
      productId: it.product_id,
      name: it.name,
      cardType: CARD_TYPE_MAP[it.card_type] ?? "Standard",
      color: it.color,
      qty: it.qty,
      price: Number(it.price),
    })),
    amount: Number(o.amount),
    shipping: Number(o.shipping),
    total: Number(o.total),
    paymentMethod: PAYMENT_METHOD_MAP[o.payment_method] ?? "UPI",
    paymentStatus: PAYMENT_STATUS_MAP[o.payment_status] ?? "Pending",
    status: ORDER_STATUS_MAP[o.status] ?? "Pending",
    date: o.placed_at,
    address: o.address,
    tracking: o.tracking as TrackingStep[],
    assignedCardId: o.assigned_card_id !== null ? String(o.assigned_card_id) : null,
  }
}

export interface AdminOrderPage {
  data: Order[]
  count: number
  page: number
  numPages: number
}

export const adminOrderApi = {
  list: async (params: { page?: number; search?: string; status?: OrderStatus | "All" }): Promise<AdminOrderPage> => {
    const qs = new URLSearchParams()
    if (params.page) qs.set("page", String(params.page))
    if (params.search) qs.set("search", params.search)
    if (params.status && params.status !== "All") qs.set("status", ORDER_STATUS_REVERSE_MAP[params.status])
    qs.set("page_size", "100")
    const envelope = await rawRequest<ApiAdminOrder[]>(`/admin/orders/?${qs.toString()}`)
    return {
      data: (envelope.data ?? []).map(toFrontendOrder),
      count: envelope.pagination?.count ?? 0,
      page: envelope.pagination?.page ?? 1,
      numPages: envelope.pagination?.num_pages ?? 1,
    }
  },

  get: async (id: string): Promise<Order> => toFrontendOrder(await request<ApiAdminOrder>(`/admin/orders/${id}/`)),

  updateStatus: async (id: string, status: OrderStatus): Promise<Order> =>
    toFrontendOrder(
      await request<ApiAdminOrder>(`/admin/orders/${id}/status/`, {
        method: "POST",
        body: { status: ORDER_STATUS_REVERSE_MAP[status] },
      }),
    ),

  assignCard: async (id: string, cardId: string): Promise<Order> =>
    toFrontendOrder(
      await request<ApiAdminOrder>(`/admin/orders/${id}/assign-card/`, {
        method: "POST",
        body: { card_id: Number(cardId) },
      }),
    ),
}

// ---------------------------------------------------------------------
// Admin support tickets
// ---------------------------------------------------------------------

interface ApiAdminTicketMessage {
  id: number
  sender: "CUSTOMER" | "SUPPORT"
  text: string
  created_at: string
}
interface ApiAdminTicket {
  id: number
  customer_id: number
  customer_name: string
  customer_email: string
  subject: string
  description: string
  priority: string
  status: string
  messages: ApiAdminTicketMessage[]
  created_at: string
  updated_at: string
}

function toFrontendTicket(t: ApiAdminTicket): SupportTicket {
  return {
    id: String(t.id),
    customerId: String(t.customer_id),
    customerName: t.customer_name,
    subject: t.subject,
    description: t.description,
    priority: TICKET_PRIORITY_MAP[t.priority] ?? "Medium",
    status: TICKET_STATUS_MAP[t.status] ?? "Open",
    createdOn: t.created_at,
    updatedOn: t.updated_at,
    messages: t.messages.map((m) => ({
      from: m.sender === "SUPPORT" ? "support" : "customer",
      text: m.text,
      date: m.created_at,
    })),
  }
}

export interface AdminTicketPage {
  data: SupportTicket[]
  count: number
  page: number
  numPages: number
}

export const adminSupportApi = {
  list: async (params: {
    page?: number
    search?: string
    status?: TicketStatus | "All"
    priority?: TicketPriority | "All"
  }): Promise<AdminTicketPage> => {
    const qs = new URLSearchParams()
    if (params.page) qs.set("page", String(params.page))
    if (params.search) qs.set("search", params.search)
    if (params.status && params.status !== "All") qs.set("status", TICKET_STATUS_REVERSE_MAP[params.status])
    if (params.priority && params.priority !== "All") qs.set("priority", TICKET_PRIORITY_REVERSE_MAP[params.priority])
    qs.set("page_size", "100")
    const envelope = await rawRequest<ApiAdminTicket[]>(`/admin/support/?${qs.toString()}`)
    return {
      data: (envelope.data ?? []).map(toFrontendTicket),
      count: envelope.pagination?.count ?? 0,
      page: envelope.pagination?.page ?? 1,
      numPages: envelope.pagination?.num_pages ?? 1,
    }
  },

  create: async (values: { customerEmail: string; subject: string; description: string; priority?: TicketPriority }) =>
    toFrontendTicket(
      await request<ApiAdminTicket>("/admin/support/", {
        method: "POST",
        body: {
          customer_email: values.customerEmail,
          subject: values.subject,
          description: values.description,
          priority: values.priority ? TICKET_PRIORITY_REVERSE_MAP[values.priority] : undefined,
        },
      }),
    ),

  updateStatus: async (id: string, status: TicketStatus): Promise<SupportTicket> =>
    toFrontendTicket(
      await request<ApiAdminTicket>(`/admin/support/${id}/status/`, {
        method: "POST",
        body: { status: TICKET_STATUS_REVERSE_MAP[status] },
      }),
    ),

  addMessage: async (id: string, text: string): Promise<SupportTicket> =>
    toFrontendTicket(
      await request<ApiAdminTicket>(`/admin/support/${id}/messages/`, { method: "POST", body: { text } }),
    ),
}

// ---------------------------------------------------------------------
// Admin transactions
// ---------------------------------------------------------------------

interface ApiAdminTransaction {
  id: number
  order_id: number
  customer_id: number
  customer_name: string
  amount: string
  method: string
  status: string
  created_at: string
}

function toFrontendTransaction(t: ApiAdminTransaction): Transaction {
  return {
    id: String(t.id),
    orderId: String(t.order_id),
    customerId: String(t.customer_id),
    customerName: t.customer_name,
    amount: Number(t.amount),
    method: PAYMENT_METHOD_MAP[t.method] ?? "UPI",
    status: PAYMENT_STATUS_MAP[t.status] ?? "Pending",
    date: t.created_at,
  }
}

export interface AdminTransactionPage {
  data: Transaction[]
  count: number
  page: number
  numPages: number
}

export const adminTransactionApi = {
  list: async (params: {
    page?: number
    search?: string
    method?: PaymentMethod | "All"
    status?: PaymentStatus | "All"
  }): Promise<AdminTransactionPage> => {
    const qs = new URLSearchParams()
    if (params.page) qs.set("page", String(params.page))
    if (params.search) qs.set("search", params.search)
    if (params.method && params.method !== "All") qs.set("method", PAYMENT_METHOD_REVERSE_MAP[params.method])
    if (params.status && params.status !== "All") qs.set("status", PAYMENT_STATUS_REVERSE_MAP[params.status])
    qs.set("page_size", "100")
    const envelope = await rawRequest<ApiAdminTransaction[]>(`/admin/transactions/?${qs.toString()}`)
    return {
      data: (envelope.data ?? []).map(toFrontendTransaction),
      count: envelope.pagination?.count ?? 0,
      page: envelope.pagination?.page ?? 1,
      numPages: envelope.pagination?.num_pages ?? 1,
    }
  },
}

// ---------------------------------------------------------------------
// Admin reports (unpaginated, plain arrays)
// ---------------------------------------------------------------------

export interface SalesReportRow {
  orderId: string
  customer: string
  amount: number
  shipping: number
  total: number
  paymentStatus: PaymentStatus
  orderStatus: OrderStatus
  date: string
}
export interface TapAnalyticsReportRow {
  customerId: string
  customerName: string
  taps: number
  qrScans: number
  profileViews: number
}
export interface CustomerReportRow {
  id: string
  name: string
  email: string
  phone: string
  status: "Active" | "Inactive"
  totalOrders: number
  totalSpent: number
  totalTaps: number
  joinedOn: string
}
export interface OrderReportRow {
  orderId: string
  customer: string
  items: number
  total: number
  status: OrderStatus
  paymentMethod: PaymentMethod
  date: string
}

export const adminReportApi = {
  sales: async (): Promise<SalesReportRow[]> => {
    const rows = await request<
      { order_id: number; customer: string; amount: string; shipping: string; total: string; payment_status: string; order_status: string; date: string }[]
    >("/admin/reports/sales/")
    return rows.map((r) => ({
      orderId: String(r.order_id),
      customer: r.customer,
      amount: Number(r.amount),
      shipping: Number(r.shipping),
      total: Number(r.total),
      paymentStatus: PAYMENT_STATUS_MAP[r.payment_status] ?? "Pending",
      orderStatus: ORDER_STATUS_MAP[r.order_status] ?? "Pending",
      date: r.date,
    }))
  },

  tapAnalytics: async (): Promise<TapAnalyticsReportRow[]> => {
    const rows = await request<
      { customer_id: number; customer_name: string; taps: number; qr_scans: number; profile_views: number }[]
    >("/admin/reports/tap-analytics/")
    return rows.map((r) => ({
      customerId: String(r.customer_id),
      customerName: r.customer_name,
      taps: r.taps,
      qrScans: r.qr_scans,
      profileViews: r.profile_views,
    }))
  },

  customers: async (): Promise<CustomerReportRow[]> => {
    const rows = await request<
      { id: number; name: string; email: string; phone: string; status: "Active" | "Inactive"; total_orders: number; total_spent: number; total_taps: number; joined_on: string }[]
    >("/admin/reports/customers/")
    return rows.map((r) => ({
      id: String(r.id),
      name: r.name,
      email: r.email,
      phone: r.phone,
      status: r.status,
      totalOrders: r.total_orders,
      totalSpent: r.total_spent,
      totalTaps: r.total_taps,
      joinedOn: r.joined_on,
    }))
  },

  orders: async (): Promise<OrderReportRow[]> => {
    const rows = await request<
      { order_id: number; customer: string; items: number; total: string; status: string; payment_method: string; date: string }[]
    >("/admin/reports/orders/")
    return rows.map((r) => ({
      orderId: String(r.order_id),
      customer: r.customer,
      items: r.items,
      total: Number(r.total),
      status: ORDER_STATUS_MAP[r.status] ?? "Pending",
      paymentMethod: PAYMENT_METHOD_MAP[r.payment_method] ?? "UPI",
      date: r.date,
    }))
  },
}

// ---------------------------------------------------------------------
// Admin analytics summary
// ---------------------------------------------------------------------

export interface AdminAnalyticsSummary {
  rangeDays: number
  totalTaps: number
  qrScans: number
  profileViews: number
  contactSaves: number
  shares: number
  uniqueVisitors: number
  byDay: { date: string; count: number }[]
  byDevice: { device: string; count: number }[]
  topLocations: { location: string; count: number }[]
}

export const adminAnalyticsApi = {
  summary: async (params: { range?: number; customerId?: string } = {}): Promise<AdminAnalyticsSummary> => {
    const qs = new URLSearchParams()
    if (params.range) qs.set("range", String(params.range))
    if (params.customerId) qs.set("customer_id", params.customerId)
    const query = qs.toString()
    const d = await request<{
      range_days: number
      total_taps: number
      qr_scans: number
      profile_views: number
      contact_saves: number
      shares: number
      unique_visitors: number
      by_day: { date: string; count: number }[]
      by_device: { device: string; count: number }[]
      top_locations: { location: string; count: number }[]
    }>(`/admin/analytics/summary/${query ? `?${query}` : ""}`)
    return {
      rangeDays: d.range_days,
      totalTaps: d.total_taps,
      qrScans: d.qr_scans,
      profileViews: d.profile_views,
      contactSaves: d.contact_saves,
      shares: d.shares,
      uniqueVisitors: d.unique_visitors,
      byDay: d.by_day,
      byDevice: d.by_device,
      topLocations: d.top_locations,
    }
  },
}

// ---------------------------------------------------------------------
// Admin digital profiles (admin_api.profiles — distinct from
// adminCustomerApi, which lists the User/Customer directory)
// ---------------------------------------------------------------------

interface ApiAdminProfile {
  id: number
  full_name: string
  username: string
  designation: string
  company: string
  email: string
  phone: string
  bio: string
  avatar: string
  profile_link: string
  status: "ACTIVE" | "SUSPENDED"
  social_links: ApiSocialLink[]
  created_at: string
}

function toFrontendAdminProfile(p: ApiAdminProfile): Profile {
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
    website: "",
    address: "",
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
    customLinks: [],
    customFields: [],
    services: [],
  }
}

export interface AdminProfilePage {
  data: Profile[]
  count: number
  page: number
  numPages: number
}

export const adminProfileApi = {
  list: async (params: { page?: number; search?: string }): Promise<AdminProfilePage> => {
    const qs = new URLSearchParams()
    if (params.page) qs.set("page", String(params.page))
    if (params.search) qs.set("search", params.search)
    qs.set("page_size", "100")
    const envelope = await rawRequest<ApiAdminProfile[]>(`/admin/profiles/?${qs.toString()}`)
    return {
      data: (envelope.data ?? []).map(toFrontendAdminProfile),
      count: envelope.pagination?.count ?? 0,
      page: envelope.pagination?.page ?? 1,
      numPages: envelope.pagination?.num_pages ?? 1,
    }
  },

  create: async (userId: string): Promise<Profile> =>
    toFrontendAdminProfile(await request<ApiAdminProfile>("/admin/profiles/", { method: "POST", body: { user_id: Number(userId) } })),

  update: async (
    id: string,
    patch: { fullName?: string; designation?: string; company?: string; phone?: string; bio?: string },
  ): Promise<Profile> => {
    const body: Record<string, unknown> = {}
    if (patch.fullName !== undefined) body.full_name = patch.fullName
    if (patch.designation !== undefined) body.designation = patch.designation
    if (patch.company !== undefined) body.company = patch.company
    if (patch.phone !== undefined) body.phone = patch.phone
    if (patch.bio !== undefined) body.bio = patch.bio
    return toFrontendAdminProfile(await request<ApiAdminProfile>(`/admin/profiles/${id}/`, { method: "PATCH", body }))
  },

  activate: async (id: string): Promise<Profile> =>
    toFrontendAdminProfile(await request<ApiAdminProfile>(`/admin/profiles/${id}/activate/`, { method: "POST" })),

  suspend: async (id: string): Promise<Profile> =>
    toFrontendAdminProfile(await request<ApiAdminProfile>(`/admin/profiles/${id}/suspend/`, { method: "POST" })),
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

// Shape matches backend/orders/serializers.py's OrderSerializer — the
// `orders` app (not customer_management.customer_orders) is what
// /api/customer/orders/ actually routes to (see config/urls.py), because
// admin_api reads Order rows from this same table. There is no
// order_number field on this model — `id` is the only identifier.
export interface ApiOrderItem {
  product_id: string
  name: string
  card_type: string
  color: string
  qty: number
  price: string
}
export interface ApiOrderTrackingStep {
  label: string
  date: string | null
  done: boolean
}
export interface ApiOrderAddress {
  line1: string
  city: string
  state: string
  pincode: string
  country: string
}
export interface ApiOrder {
  id: number
  customer_id: number
  customer_name: string
  customer_email: string
  customer_phone: string
  items: ApiOrderItem[]
  amount: string
  shipping: string
  total: string
  payment_method: string
  payment_status: string
  status: string
  address: ApiOrderAddress
  tracking: ApiOrderTrackingStep[]
  assigned_card_id: number | null
  placed_at: string
}

// Matches backend/orders/serializers.py's CustomerOrderCreateSerializer.
export interface CreateOrderPayload {
  idempotency_key?: string
  items: { product_id: string; name: string; card_type: string; color: string; qty: number; price: number }[]
  shipping?: number
  payment_method: "UPI" | "CARD" | "NET_BANKING" | "RAZORPAY" | "COD"
  shipping_line1: string
  shipping_city: string
  shipping_state?: string
  shipping_pincode: string
  shipping_country?: string
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
