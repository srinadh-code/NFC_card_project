import { useEffect, useState } from "react"
import { useCustomerAuthStore } from "@/store/auth-store"
import { useDataStore, selectProfileByCustomer } from "@/store/data-store"

/**
 * Reads the signed-in customer's Profile, self-healing if it's missing
 * (e.g. a session created before automatic onboarding existed). This is a
 * second, page-level line of defense on top of the repair CustomerLayout
 * already runs on every route change — so Profile/Social Links/QR Code
 * never get stuck on a permanently-missing record, even if this hook is
 * ever used somewhere outside that layout.
 *
 * `stuck` flips true only if the profile is still missing ~1.2s after
 * mount (repair is normally synchronous/instant) — pages should render a
 * real empty state with a retry action when `stuck` is true, never an
 * indefinite skeleton.
 */
export function useEnsuredProfile() {
  const customer = useCustomerAuthStore((s) => s.customer)
  const profile = useDataStore(selectProfileByCustomer(customer?.id ?? ""))
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    if (!customer || profile) {
      setStuck(false)
      return
    }
    useDataStore.getState().ensureCustomerProfile({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      avatar: customer.avatar,
    })
    const t = setTimeout(() => setStuck(true), 1200)
    return () => clearTimeout(t)
  }, [customer, profile])

  function retry() {
    if (!customer) return
    useDataStore.getState().ensureCustomerProfile({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      avatar: customer.avatar,
    })
    setStuck(false)
  }

  return { customer, profile, stuck, retry }
}
