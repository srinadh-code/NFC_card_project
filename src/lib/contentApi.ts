// API client for the Website Content CMS module. Talks to the real Django
// backend under /api/website/... — see tracker-backend/website_content/.
// Follows the `request()`/envelope pattern established in lib/api.ts
// (nfcApi/profileApi), but factors the repeated list/detail/reorder/image
// boilerplate shared by ~13 near-identical resources into small generic
// helpers instead of hand-rolling each one.
import { request, requestRaw, type Pagination } from "./api"
import type {
  AboutFeature,
  AboutPage,
  BuiltFromExperience,
  Company,
  ContactMessage,
  Cta,
  Faq,
  Feature,
  Hero,
  HeroFeature,
  HowItFeels,
  HowItFeelsPoint,
  HowItWorksStep,
  Mission,
  PublicAboutPayload,
  PublicHomePayload,
  Statistic,
  StatisticPage,
  Testimonial,
  Value,
  WhyChoose,
  WithId,
} from "@/types/content"

const ADMIN = "/website/admin"
const PUBLIC = "/website/public"

function buildQuery(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return ""
  const usp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") usp.set(key, String(value))
  }
  const qs = usp.toString()
  return qs ? `?${qs}` : ""
}

// ---------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------

interface CrudApi<T extends WithId> {
  list: (query?: Record<string, string | number | boolean | undefined>) => Promise<T[]>
  create: (body: Partial<T>) => Promise<T>
  update: (id: number, body: Partial<T>) => Promise<T>
  remove: (id: number) => Promise<void>
  reorder: (order: number[]) => Promise<void>
}

// Standard "list + create, detail (get/update/delete), reorder" collection.
function makeCrudApi<T extends WithId>(basePath: string): CrudApi<T> {
  return {
    list: (query) => request<T[]>(`${basePath}/${buildQuery(query)}`),
    create: (body) => request<T>(`${basePath}/`, { method: "POST", body }),
    update: (id, body) => request<T>(`${basePath}/${id}/`, { method: "PATCH", body }),
    remove: (id) => request<void>(`${basePath}/${id}/`, { method: "DELETE" }),
    reorder: (order) => request<void>(`${basePath}/reorder/`, { method: "PATCH", body: { order } }),
  }
}

interface ImageApi<T> {
  uploadImage: (id: number, file: File) => Promise<T>
  removeImage: (id: number) => Promise<T>
}

// Per-row image upload/remove, for collection resources (testimonials,
// companies) whose rows each carry their own image.
function makeImageApi<T>(basePath: string): ImageApi<T> {
  return {
    uploadImage: (id, file) => {
      const formData = new FormData()
      formData.append("image", file)
      return request<T>(`${basePath}/${id}/image/`, { method: "POST", body: formData, isFormData: true })
    },
    removeImage: (id) => request<T>(`${basePath}/${id}/image/`, { method: "DELETE" }),
  }
}

interface SingletonApi<T> {
  get: () => Promise<T>
  update: (body: Partial<T>) => Promise<T>
}

// Singleton section (Hero, HowItFeels, CTA, AboutPage, Mission, ...).
function makeSingletonApi<T>(basePath: string): SingletonApi<T> {
  return {
    get: () => request<T>(`${basePath}/`),
    update: (body) => request<T>(`${basePath}/`, { method: "PATCH", body }),
  }
}

interface SingletonImageApi<T> {
  uploadImage: (file: File) => Promise<T>
  removeImage: () => Promise<T>
}

// Singleton section with an optional image (Hero, BuiltFromExperience).
function makeSingletonImageApi<T>(basePath: string): SingletonImageApi<T> {
  return {
    uploadImage: (file) => {
      const formData = new FormData()
      formData.append("image", file)
      return request<T>(`${basePath}/image/`, { method: "POST", body: formData, isFormData: true })
    },
    removeImage: () => request<T>(`${basePath}/image/`, { method: "DELETE" }),
  }
}

// ---------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------

export const heroApi = {
  ...makeSingletonApi<Hero>(`${ADMIN}/home/hero`),
  ...makeSingletonImageApi<Hero>(`${ADMIN}/home/hero`),
}
export const heroFeaturesApi = makeCrudApi<HeroFeature>(`${ADMIN}/home/hero-features`)
export const howItFeelsApi = makeSingletonApi<HowItFeels>(`${ADMIN}/home/how-it-feels`)
export const howItFeelsPointsApi = makeCrudApi<HowItFeelsPoint>(`${ADMIN}/home/how-it-feels-points`)
export const ctaApi = makeSingletonApi<Cta>(`${ADMIN}/home/cta`)

// ---------------------------------------------------------------------
// About
// ---------------------------------------------------------------------

export const aboutPageApi = makeSingletonApi<AboutPage>(`${ADMIN}/about/page`)
export const aboutFeaturesApi = makeCrudApi<AboutFeature>(`${ADMIN}/about/features`)
export const missionApi = makeSingletonApi<Mission>(`${ADMIN}/about/mission`)
export const whyChooseApi = makeCrudApi<WhyChoose>(`${ADMIN}/about/why-choose`)
export const builtFromExperienceApi = {
  ...makeSingletonApi<BuiltFromExperience>(`${ADMIN}/about/built-from-experience`),
  ...makeSingletonImageApi<BuiltFromExperience>(`${ADMIN}/about/built-from-experience`),
}

// ---------------------------------------------------------------------
// Shared resources
// ---------------------------------------------------------------------

export const valuesApi = makeCrudApi<Value>(`${ADMIN}/values`)
export const featuresApi = makeCrudApi<Feature>(`${ADMIN}/features`)
export const howItWorksApi = makeCrudApi<HowItWorksStep>(`${ADMIN}/how-it-works`)
export const faqsApi = makeCrudApi<Faq>(`${ADMIN}/faqs`)
export const testimonialsApi = {
  ...makeCrudApi<Testimonial>(`${ADMIN}/testimonials`),
  ...makeImageApi<Testimonial>(`${ADMIN}/testimonials`),
}
export const companiesApi = {
  ...makeCrudApi<Company>(`${ADMIN}/companies`),
  ...makeImageApi<Company>(`${ADMIN}/companies`),
}
export const statisticsApi = makeCrudApi<Statistic>(`${ADMIN}/statistics`)

export function listStatisticsByPage(page: StatisticPage) {
  return statisticsApi.list({ page })
}

// ---------------------------------------------------------------------
// Contact messages — server-paginated, PATCH only writes is_read/is_resolved.
// ---------------------------------------------------------------------

export interface ContactMessageListParams {
  page?: number
  page_size?: number
  is_read?: boolean
  is_resolved?: boolean
  [key: string]: string | number | boolean | undefined
}

export interface PaginatedResult<T> {
  items: T[]
  pagination: Pagination
}

export const contactMessagesApi = {
  list: async (params?: ContactMessageListParams): Promise<PaginatedResult<ContactMessage>> => {
    const envelope = await requestRaw<ContactMessage[]>(`${ADMIN}/contact-messages/${buildQuery(params)}`)
    return {
      items: envelope.data ?? [],
      pagination:
        envelope.pagination ?? { count: 0, page: 1, num_pages: 1, page_size: params?.page_size ?? 10, next: null, previous: null },
    }
  },
  update: (id: number, patch: { is_read?: boolean; is_resolved?: boolean }) =>
    request<ContactMessage>(`${ADMIN}/contact-messages/${id}/`, { method: "PATCH", body: patch }),
  remove: (id: number) => request<void>(`${ADMIN}/contact-messages/${id}/`, { method: "DELETE" }),
  reply: (id: number, content: string) =>
    request<ContactMessage>(`${ADMIN}/contact-messages/${id}/reply/`, { method: "POST", body: { content } }),
}

// ---------------------------------------------------------------------
// Public reads — not used by the admin UI itself, but defined here since
// they're trivial and Phase 4 (public marketing site wiring) will consume
// them directly from this same module. auth: false since these are AllowAny.
// ---------------------------------------------------------------------

export const publicWebsiteApi = {
  getHome: () => request<PublicHomePayload>(`${PUBLIC}/home/`, { auth: false }),
  getAbout: () => request<PublicAboutPayload>(`${PUBLIC}/about/`, { auth: false }),
  getFeatures: () => request<Feature[]>(`${PUBLIC}/features/`, { auth: false }),
  getHowItWorks: () => request<HowItWorksStep[]>(`${PUBLIC}/how-it-works/`, { auth: false }),
  getFaqs: () => request<Faq[]>(`${PUBLIC}/faqs/`, { auth: false }),
  getValues: () => request<Value[]>(`${PUBLIC}/values/`, { auth: false }),
  getTestimonials: () => request<Testimonial[]>(`${PUBLIC}/testimonials/`, { auth: false }),
  getCompanies: () => request<Company[]>(`${PUBLIC}/companies/`, { auth: false }),
  getStatistics: (page?: StatisticPage) => request<Statistic[]>(`${PUBLIC}/statistics/${buildQuery({ page })}`, { auth: false }),
  submitContactMessage: (body: { name: string; email: string; subject: string; message: string }) =>
    request<null>(`${PUBLIC}/contact/`, { method: "POST", body, auth: false }),
}
