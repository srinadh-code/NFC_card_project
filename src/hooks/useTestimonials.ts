import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ApiError, NetworkError } from "@/lib/api"
import { adminTestimonialApi, customerTestimonialApi, publicTestimonialApi } from "@/lib/testimonialApi"
import type { AdminTestimonialAction, AdminTestimonialListParams, TestimonialInput } from "@/types/testimonial"

export const testimonialKeys = {
  all: ["testimonials"] as const,
  public: (limit?: number) => ["testimonials", "public", limit ?? "all"] as const,
  mine: ["testimonials", "mine"] as const,
  eligibility: ["testimonials", "eligibility"] as const,
  admin: ["testimonials", "admin"] as const,
  adminList: (params: AdminTestimonialListParams) => ["testimonials", "admin", "list", params] as const,
  adminStats: ["testimonials", "admin", "stats"] as const,
}

export function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message
  return fallback
}

// ---------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------

export function usePublicTestimonials(limit?: number) {
  return useQuery({
    queryKey: testimonialKeys.public(limit),
    queryFn: () => publicTestimonialApi.list(limit),
    staleTime: 5 * 60_000,
  })
}

// ---------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------

export function useMyTestimonials() {
  return useQuery({ queryKey: testimonialKeys.mine, queryFn: customerTestimonialApi.mine })
}

export function useTestimonialEligibility() {
  return useQuery({ queryKey: testimonialKeys.eligibility, queryFn: customerTestimonialApi.eligibility })
}

function useInvalidateCustomer() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: testimonialKeys.mine })
    queryClient.invalidateQueries({ queryKey: testimonialKeys.eligibility })
  }
}

// Create/update surface their errors inline in the form (field-level or a
// banner), so they don't toast on error — only on success.
export function useCreateTestimonial() {
  const invalidate = useInvalidateCustomer()
  return useMutation({
    mutationFn: (input: TestimonialInput) => customerTestimonialApi.create(input),
    onSuccess: () => {
      toast.success("Thank you! Your testimonial has been submitted for approval.")
      invalidate()
    },
  })
}

export function useUpdateTestimonial() {
  const invalidate = useInvalidateCustomer()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: TestimonialInput }) => customerTestimonialApi.update(id, input),
    onSuccess: () => {
      toast.success("Testimonial updated.")
      invalidate()
    },
    // A 403 here means an admin reviewed it meanwhile — refresh so the
    // card shows its real status.
    onError: (err) => {
      if (err instanceof ApiError && err.status === 403) invalidate()
    },
  })
}

export function useDeleteTestimonial() {
  const invalidate = useInvalidateCustomer()
  return useMutation({
    mutationFn: (id: number) => customerTestimonialApi.remove(id),
    onSuccess: () => {
      toast.success("Testimonial deleted.")
      invalidate()
    },
    onError: (err) => {
      toast.error(errorMessage(err, "Unable to delete this testimonial. Please try again."))
      invalidate()
    },
  })
}

// ---------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------

export function useAdminTestimonials(params: AdminTestimonialListParams) {
  return useQuery({
    queryKey: testimonialKeys.adminList(params),
    queryFn: () => adminTestimonialApi.list(params),
    placeholderData: keepPreviousData,
  })
}

export function useAdminTestimonialStats() {
  return useQuery({ queryKey: testimonialKeys.adminStats, queryFn: adminTestimonialApi.stats })
}

function useInvalidateAdmin() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: testimonialKeys.admin })
    queryClient.invalidateQueries({ queryKey: ["testimonials", "public"] })
  }
}

export function useModerateTestimonial() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: AdminTestimonialAction }) =>
      adminTestimonialApi.moderate(id, action),
    onSuccess: (envelope) => {
      toast.success(envelope.message)
      invalidate()
    },
    onError: (err) => toast.error(errorMessage(err, "Unable to update this testimonial. Please try again.")),
  })
}

export function useAdminDeleteTestimonial() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (id: number) => adminTestimonialApi.remove(id),
    onSuccess: () => {
      toast.success("Testimonial deleted.")
      invalidate()
    },
    onError: (err) => toast.error(errorMessage(err, "Unable to delete this testimonial. Please try again.")),
  })
}
