// Testimonials API — public feed, the customer's own testimonials, and admin
// moderation. Talks to the Django `testimonials` app (/testimonials/) and
// `admin_api/testimonials` (/admin/testimonials/).
import { request, requestRaw } from "@/lib/api"
import type {
  AdminTestimonial,
  AdminTestimonialAction,
  AdminTestimonialListParams,
  AdminTestimonialPage,
  AdminTestimonialStats,
  MyTestimonial,
  PublicTestimonial,
  TestimonialEligibility,
  TestimonialInput,
} from "@/types/testimonial"

// Always multipart, so the same payload works with or without an image.
function toFormData(input: TestimonialInput): FormData {
  const form = new FormData()
  form.append("name", input.name.trim())
  form.append("designation", input.designation.trim())
  form.append("company", input.company.trim())
  form.append("rating", String(input.rating))
  form.append("review", input.review.trim())
  if (input.order != null) form.append("order", String(input.order))
  if (input.profile_image) form.append("profile_image", input.profile_image)
  else if (input.remove_profile_image) form.append("remove_profile_image", "true")
  return form
}

export const publicTestimonialApi = {
  list: (limit?: number) =>
    request<PublicTestimonial[]>(`/testimonials/${limit ? `?limit=${limit}` : ""}`, { auth: false }),
}

export const customerTestimonialApi = {
  mine: () => request<MyTestimonial[]>("/testimonials/my/"),

  eligibility: () => request<TestimonialEligibility>("/testimonials/eligibility/"),

  create: (input: TestimonialInput) =>
    request<MyTestimonial>("/testimonials/create/", { method: "POST", body: toFormData(input), isFormData: true }),

  update: (id: number, input: TestimonialInput) =>
    request<MyTestimonial>(`/testimonials/${id}/update/`, {
      method: "PUT",
      body: toFormData(input),
      isFormData: true,
    }),

  remove: (id: number) => request<null>(`/testimonials/${id}/delete/`, { method: "DELETE" }),
}

export const adminTestimonialApi = {
  list: async (params: AdminTestimonialListParams): Promise<AdminTestimonialPage> => {
    const qs = new URLSearchParams()
    if (params.page) qs.set("page", String(params.page))
    if (params.search) qs.set("search", params.search)
    if (params.status && params.status !== "ALL") qs.set("status", params.status)
    const query = qs.toString()
    const envelope = await requestRaw<AdminTestimonial[]>(`/admin/testimonials/${query ? `?${query}` : ""}`)
    return {
      data: envelope.data ?? [],
      count: envelope.pagination?.count ?? 0,
      page: envelope.pagination?.page ?? 1,
      numPages: envelope.pagination?.num_pages ?? 1,
    }
  },

  stats: () => request<AdminTestimonialStats>("/admin/testimonials/stats/"),

  moderate: (id: number, action: AdminTestimonialAction) =>
    requestRaw<AdminTestimonial>(`/admin/testimonials/${id}/${action}/`, { method: "PATCH" }),

  remove: (id: number) => request<null>(`/admin/testimonials/${id}/`, { method: "DELETE" }),
}
