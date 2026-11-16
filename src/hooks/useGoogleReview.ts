import { useQuery } from "@tanstack/react-query"
import { googleReviewApi } from "@/lib/api"
import { useCustomerAuthStore } from "@/store/auth-store"

export const googleReviewKey = (customerId?: string) => ["google-review", customerId] as const

export function useGoogleReview() {
  const customer = useCustomerAuthStore((state) => state.customer)
  return useQuery({
    queryKey: googleReviewKey(customer?.id),
    queryFn: googleReviewApi.get,
    enabled: Boolean(customer),
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  })
}
