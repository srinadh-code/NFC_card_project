// Centralized API client for the Django backend. Replaces the old
// mock-api.ts / Zustand-as-backend pattern for the Phase A slice
// (auth, profile, social/custom links, NFC cards, public profile).
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

export class ApiError extends Error {
  status: number
  errors: Record<string, unknown>
  constructor(message: string, status: number, errors: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

export interface Pagination {
  count: number
  page: number
  num_pages: number
  page_size: number
  next: string | null
  previous: string | null
}

export interface Envelope<T> {
  success: boolean
  message: string
  data?: T
  errors?: Record<string, unknown>
  pagination?: Pagination
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

async function requestEnvelope<T>(path: string, options: RequestOptions = {}, retried = false): Promise<Envelope<T>> {
  const { method = "GET", body, auth = true, isFormData = false } = options

  const headers: Record<string, string> = {}
  if (!isFormData) headers["Content-Type"] = "application/json"
  if (auth) {
    const token = getAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  })

  if (res.status === 401 && auth && !retried && getRefreshToken()) {
    const refreshed = await refreshAccessToken()
    if (refreshed) return requestEnvelope<T>(path, options, true)
    clearTokens()
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

// Standard call path used by every existing call-site: unwraps and returns
// only the envelope's `data` payload. Exported (not just used internally)
// because src/lib/contentApi.ts imports it directly for the Website Content
// module's generic CRUD/singleton API helpers.
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const json = await requestEnvelope<T>(path, options)
  return json.data as T
}

// Same request/auth/refresh handling as `request`, but resolves with the
// full envelope (including the `pagination` sibling key some paginated
// admin list endpoints return alongside `data`) instead of unwrapping it.
export async function requestRaw<T>(path: string, options: RequestOptions = {}): Promise<Envelope<T>> {
  return requestEnvelope<T>(path, options)
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
// Profile — adapts the backend's shape to the frontend's existing
// `Profile` / `SocialLink` / `CustomLink` / `CustomField` types so
// components like DigitalCardPreview and CustomFieldsEditor need no
// changes. Real backend ids are tracked in side caches (below) so the
// write paths (which the frontend types don't carry ids for, in the
// case of SocialLink) can still target the right row.
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
    website: p.website,
    address: p.address,
    bio: p.bio,
    avatar: p.avatar,
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
    // Extra fields not on the shared Profile type, read via the
    // `profileApi.getPrivacySettings` helper below instead.
  }
}

export const profileApi = {
  getMine: async (): Promise<Profile> => toFrontendProfile(await request<ApiProfile>("/profiles/me/")),

  updateMine: async (patch: {
    fullName?: string
    designation?: string
    company?: string
    phone?: string
    website?: string
    address?: string
    bio?: string
  }): Promise<Profile> => {
    const body: Record<string, unknown> = {}
    if (patch.fullName !== undefined) body.full_name = patch.fullName
    if (patch.designation !== undefined) body.designation = patch.designation
    if (patch.company !== undefined) body.company = patch.company
    if (patch.phone !== undefined) body.phone = patch.phone
    if (patch.website !== undefined) body.website = patch.website
    if (patch.address !== undefined) body.address = patch.address
    if (patch.bio !== undefined) body.bio = patch.bio
    return toFrontendProfile(await request<ApiProfile>("/profiles/me/", { method: "PATCH", body }))
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

  uploadAvatar: async (file: File): Promise<Profile> => {
    const formData = new FormData()
    formData.append("avatar", file)
    return toFrontendProfile(
      await request<ApiProfile>("/profiles/me/avatar/", { method: "POST", body: formData, isFormData: true }),
    )
  },

  getPublic: async (username: string): Promise<Profile | null> => {
    try {
      const p = await request<Omit<ApiProfile, "id" | "profile_url" | "status" | "profile_public" | "show_contact_info" | "show_in_search" | "created_at">>(
        `/profiles/public/${encodeURIComponent(username)}/`,
        { auth: false },
      )
      return {
        id: p.username,
        customerId: p.username,
        username: p.username,
        fullName: p.full_name,
        designation: p.designation,
        company: p.company,
        email: p.email ?? "",
        phone: p.phone ?? "",
        website: p.website,
        address: p.address,
        bio: p.bio,
        avatar: p.avatar,
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
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  },

  // --- Social links: keyed by platform (matches the frontend SocialLink
  // type, which has no id). Requires getMine()/getPublic() to have run at
  // least once so the platform->id cache is populated. ---
  saveSocialLinks: async (links: SocialLink[]) => {
    await Promise.all(
      links.map((link) => {
        const id = socialLinkIdByPlatform.get(link.platform)
        if (id === undefined) return Promise.resolve()
        return request(`/profiles/social-links/${id}/`, {
          method: "PATCH",
          body: { url: link.url, enabled: link.enabled },
        })
      }),
    )
    const order = links.map((l) => socialLinkIdByPlatform.get(l.platform)).filter((v): v is number => v !== undefined)
    if (order.length) {
      await request("/profiles/social-links/reorder/", { method: "PATCH", body: { order } })
    }
  },

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
// NFC cards
// ---------------------------------------------------------------------

interface ApiNfcCard {
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

function toFrontendCard(c: ApiNfcCard): NfcCard {
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
  mine: async (): Promise<NfcCard[]> => (await request<ApiNfcCard[]>("/nfc/cards/mine/")).map(toFrontendCard),

  activate: async (uid: string): Promise<NfcCard> =>
    toFrontendCard(await request<ApiNfcCard>("/nfc/cards/activate/", { method: "POST", body: { uid } })),

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
    const envelope = await requestEnvelope<ApiAdminNfcCard[]>(`/nfc/admin/cards/${query ? `?${query}` : ""}`)
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
    const envelope = await requestEnvelope<ApiAdminCustomerListItem[]>(
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
    const envelope = await requestEnvelope<ApiAdminOrder[]>(`/admin/orders/?${qs.toString()}`)
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
    const envelope = await requestEnvelope<ApiAdminTicket[]>(`/admin/support/?${qs.toString()}`)
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
    const envelope = await requestEnvelope<ApiAdminTransaction[]>(`/admin/transactions/?${qs.toString()}`)
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
    website: "",
    address: "",
    bio: p.bio,
    avatar: p.avatar,
    status: p.status === "ACTIVE" ? "Active" : "Suspended",
    createdOn: p.created_at,
    socialLinks: p.social_links
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((l) => ({ platform: l.platform, url: l.url, enabled: l.enabled, order: l.display_order })),
    customLinks: [],
    customFields: [],
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
    const envelope = await requestEnvelope<ApiAdminProfile[]>(`/admin/profiles/?${qs.toString()}`)
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
// Customer orders — backed by the same `orders.Order` model/shape as
// adminOrderApi above (see orders/views.py CustomerOrderListCreateView),
// so an order placed here is immediately visible to admin.
// ---------------------------------------------------------------------

export interface CustomerOrderWrite {
  items: { productId: string; name: string; cardType: NfcCard["cardType"]; color: string; qty: number; price: number }[]
  shipping: number
  paymentMethod: PaymentMethod
  address: Address
  // One value per checkout *attempt*, resent unchanged on every retry of
  // that same attempt (double-click, network retry) — the backend uses it
  // to recognize and no-op a duplicate instead of creating a second order.
  // See orders/views.py CustomerOrderListCreateView.post.
  idempotencyKey: string
}

function toApiCustomerOrderPayload(values: CustomerOrderWrite): Record<string, unknown> {
  return {
    idempotency_key: values.idempotencyKey,
    items: values.items.map((it) => ({
      product_id: it.productId,
      name: it.name,
      card_type: CARD_TYPE_REVERSE_MAP[it.cardType],
      color: it.color,
      qty: it.qty,
      price: it.price,
    })),
    shipping: values.shipping,
    payment_method: PAYMENT_METHOD_REVERSE_MAP[values.paymentMethod],
    shipping_line1: values.address.line1,
    shipping_city: values.address.city,
    shipping_state: values.address.state,
    shipping_pincode: values.address.pincode,
    shipping_country: values.address.country,
  }
}

export const customerOrderApi = {
  mine: async (): Promise<Order[]> => {
    const envelope = await requestEnvelope<ApiAdminOrder[]>("/customer/orders/?page_size=100")
    return (envelope.data ?? []).map(toFrontendOrder)
  },

  get: async (id: string): Promise<Order> => toFrontendOrder(await request<ApiAdminOrder>(`/customer/orders/${id}/`)),

  create: async (values: CustomerOrderWrite): Promise<Order> =>
    toFrontendOrder(
      await request<ApiAdminOrder>("/customer/orders/", {
        method: "POST",
        body: toApiCustomerOrderPayload(values),
      }),
    ),
}

// ---------------------------------------------------------------------
// Customer analytics (customer_management.customer_analytics)
// ---------------------------------------------------------------------

export interface CustomerAnalyticsSummary {
  profileViews: { today: number; week: number; month: number; year: number }
  nfcTaps: { today: number; week: number; month: number; year: number }
  qrScans: { today: number; week: number; month: number; year: number }
  socialClicks: { today: number; week: number; month: number; year: number }
  totals: { profileViews: number; nfcTaps: number; qrScans: number; socialClicks: number }
}

interface ApiPeriodBucket {
  today: number
  week: number
  month: number
  year: number
}

export interface AnalyticsEventItem {
  device: string
  source: string
  createdAt: string
}

async function fetchAnalyticsEvents(path: string): Promise<AnalyticsEventItem[]> {
  const envelope = await requestEnvelope<{ device: string; source: string; created_at: string }[]>(
    `${path}?page_size=100`,
  )
  return (envelope.data ?? []).map((e) => ({ device: e.device, source: e.source, createdAt: e.created_at }))
}

export const customerAnalyticsApi = {
  summary: async (): Promise<CustomerAnalyticsSummary> => {
    const d = await request<{
      profile_views: ApiPeriodBucket
      nfc_taps: ApiPeriodBucket
      qr_scans: ApiPeriodBucket
      social_clicks: ApiPeriodBucket
      totals: { profile_views: number; nfc_taps: number; qr_scans: number; social_clicks: number }
    }>("/customer/analytics/summary/")
    return {
      profileViews: d.profile_views,
      nfcTaps: d.nfc_taps,
      qrScans: d.qr_scans,
      socialClicks: d.social_clicks,
      totals: {
        profileViews: d.totals.profile_views,
        nfcTaps: d.totals.nfc_taps,
        qrScans: d.totals.qr_scans,
        socialClicks: d.totals.social_clicks,
      },
    }
  },

  // Event-level detail for building charts (day-bucketed series, device
  // breakdown) the summary endpoint above can't provide — it only gives
  // cumulative today/week/month/year buckets. Capped at one page (100
  // events): plenty for a recent-activity chart, not meant for full export.
  taps: async (): Promise<AnalyticsEventItem[]> => fetchAnalyticsEvents("/customer/analytics/taps/"),
  views: async (): Promise<AnalyticsEventItem[]> => fetchAnalyticsEvents("/customer/analytics/views/"),
  scans: async (): Promise<AnalyticsEventItem[]> => fetchAnalyticsEvents("/customer/analytics/scans/"),
}

// ---------------------------------------------------------------------
// Customer leads (customer_management.customer_leads) — only the count is
// needed today (Analytics' "Leads Generated" stat); no leads list screen
// exists yet, so nothing else from this app is wired up.
// ---------------------------------------------------------------------

export const customerLeadApi = {
  count: async (): Promise<number> => {
    const envelope = await requestEnvelope<unknown[]>("/customer/leads/?page_size=1")
    return envelope.pagination?.count ?? 0
  },
}

// ---------------------------------------------------------------------
// Customer dashboard (customer_management.customer_dashboard)
// ---------------------------------------------------------------------

export interface CustomerDashboardData {
  totals: { profileViews: number; nfcTaps: number; qrScans: number; leads: number; orders: number }
}

export const customerDashboardApi = {
  get: async (): Promise<CustomerDashboardData> => {
    const d = await request<{
      totals: { profile_views: number; nfc_taps: number; qr_scans: number; leads: number; orders: number }
    }>("/customer/dashboard/")
    return {
      totals: {
        profileViews: d.totals.profile_views,
        nfcTaps: d.totals.nfc_taps,
        qrScans: d.totals.qr_scans,
        leads: d.totals.leads,
        orders: d.totals.orders,
      },
    }
  },
}

// ---------------------------------------------------------------------
// Customer settings (customer_management.customer_settings) — privacy +
// notification preferences. Distinct from `profileApi.getPrivacySettings`
// (which reads/writes profiles.Profile.profile_public etc. directly);
// this backs the separate CustomerSettings model added alongside it.
// ---------------------------------------------------------------------

export interface CustomerSettingsData {
  showEmail: boolean
  showPhone: boolean
  showCompany: boolean
  showSocialLinks: boolean
  language: string
  timezone: string
  notifyOrderUpdates: boolean
  notifyNfcUpdates: boolean
  notifyProfileViews: boolean
  notifySystemMessages: boolean
}

interface ApiCustomerSettings {
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

function toFrontendCustomerSettings(s: ApiCustomerSettings): CustomerSettingsData {
  return {
    showEmail: s.show_email,
    showPhone: s.show_phone,
    showCompany: s.show_company,
    showSocialLinks: s.show_social_links,
    language: s.language,
    timezone: s.timezone,
    notifyOrderUpdates: s.notify_order_updates,
    notifyNfcUpdates: s.notify_nfc_updates,
    notifyProfileViews: s.notify_profile_views,
    notifySystemMessages: s.notify_system_messages,
  }
}

export const customerSettingsApi = {
  get: async (): Promise<CustomerSettingsData> =>
    toFrontendCustomerSettings(await request<ApiCustomerSettings>("/customer/settings/")),

  update: async (patch: Partial<CustomerSettingsData>): Promise<CustomerSettingsData> => {
    const body: Record<string, unknown> = {}
    if (patch.showEmail !== undefined) body.show_email = patch.showEmail
    if (patch.showPhone !== undefined) body.show_phone = patch.showPhone
    if (patch.showCompany !== undefined) body.show_company = patch.showCompany
    if (patch.showSocialLinks !== undefined) body.show_social_links = patch.showSocialLinks
    if (patch.language !== undefined) body.language = patch.language
    if (patch.timezone !== undefined) body.timezone = patch.timezone
    if (patch.notifyOrderUpdates !== undefined) body.notify_order_updates = patch.notifyOrderUpdates
    if (patch.notifyNfcUpdates !== undefined) body.notify_nfc_updates = patch.notifyNfcUpdates
    if (patch.notifyProfileViews !== undefined) body.notify_profile_views = patch.notifyProfileViews
    if (patch.notifySystemMessages !== undefined) body.notify_system_messages = patch.notifySystemMessages
    return toFrontendCustomerSettings(
      await request<ApiCustomerSettings>("/customer/settings/", { method: "PUT", body }),
    )
  },
}
