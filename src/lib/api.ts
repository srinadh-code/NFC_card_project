// Centralized API client for the Django backend. Replaces the old
// mock-api.ts / Zustand-as-backend pattern for the Phase A slice
// (auth, profile, social/custom links, NFC cards, public profile).
import type { CustomField, CustomLink, NfcCard, Profile, SocialLink } from "@/types"

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

interface Envelope<T> {
  success: boolean
  message: string
  data?: T
  errors?: Record<string, unknown>
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

async function request<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
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
    if (refreshed) return request<T>(path, options, true)
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

  return json.data as T
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
