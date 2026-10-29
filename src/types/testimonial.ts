// Customer-submitted testimonials — mirrors the Django `testimonials` app
// (customer + public APIs) and `admin_api/testimonials` (moderation).

export type TestimonialStatus = "PENDING" | "APPROVED" | "REJECTED"

export const TESTIMONIAL_STATUS_LABELS: Record<TestimonialStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
}

// Keep in sync with testimonials/models.py.
export const TESTIMONIAL_REVIEW_MIN = 20
export const TESTIMONIAL_REVIEW_MAX = 1000
export const TESTIMONIAL_IMAGE_TYPES = "image/jpeg,image/png,image/webp"
export const TESTIMONIAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** GET /testimonials/ — only APPROVED + active rows ever reach this shape. */
export interface PublicTestimonial {
  id: number
  profile_image: string
  name: string
  designation: string
  company: string
  rating: number
  review: string
  created_at: string
}

/** The customer's own testimonial (GET /testimonials/my/, create, update). */
export interface MyTestimonial extends PublicTestimonial {
  order: number | null
  order_number: string | null
  status: TestimonialStatus
  is_active: boolean
  can_edit: boolean
  updated_at: string
}

export interface TestimonialEligibility {
  eligible: boolean
  has_pending: boolean
  can_submit: boolean
  message: string | null
  orders: { id: number; order_number: string | null; placed_at: string }[]
}

/** Create/update payload. `profile_image` is a new file to upload;
 *  `remove_profile_image` clears the current one (update only). */
export interface TestimonialInput {
  name: string
  designation: string
  company: string
  rating: number
  review: string
  order?: number | null
  profile_image?: File | null
  remove_profile_image?: boolean
}

export interface AdminTestimonial extends MyTestimonial {
  customer_id: number
  customer_name: string
  customer_email: string
}

export interface AdminTestimonialStats {
  total: number
  pending: number
  approved: number
  rejected: number
  live: number
}

export interface AdminTestimonialListParams {
  page?: number
  search?: string
  status?: TestimonialStatus | "ALL"
}

export interface AdminTestimonialPage {
  data: AdminTestimonial[]
  count: number
  page: number
  numPages: number
}

export type AdminTestimonialAction = "approve" | "reject" | "pending" | "toggle-active"
