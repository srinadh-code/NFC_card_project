import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCustomerAuthStore } from "@/store/auth-store"
import { profileApi } from "@/lib/api"

/**
 * Reads the signed-in customer's Profile from the real backend. The backend
 * auto-creates the Profile row (with a unique username) the first time it's
 * fetched after email verification, so there's no real "missing profile"
 * state anymore — `stuck` only flips true if the request itself keeps
 * failing (e.g. the API is unreachable), so pages can still show a retry
 * action instead of an indefinite skeleton.
 */
export function useEnsuredProfile() {
  const customer = useCustomerAuthStore((s) => s.customer)
  const queryClient = useQueryClient()
  const [stuck, setStuck] = useState(false)

  const query = useQuery({
    queryKey: ["profile-me"],
    queryFn: async () => {
      try {
        const profile = await profileApi.getMine()
        setStuck(false)
        return profile
      } catch (err) {
        setStuck(true)
        throw err
      }
    },
    enabled: Boolean(customer),
    retry: 1,
  })

  function retry() {
    setStuck(false)
    queryClient.invalidateQueries({ queryKey: ["profile-me"] })
  }

  return { customer, profile: query.data ?? null, stuck, retry }
}
