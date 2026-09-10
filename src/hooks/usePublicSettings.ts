import { useQuery } from "@tanstack/react-query"
import { publicWebsiteApi } from "@/lib/contentApi"
import type { PublicGeneralSettings } from "@/types/content"

// Shown only while the query is loading or if the public settings API is
// temporarily unreachable — see Navbar/Footer/Contact/public price+date
// displays, all of which call this hook instead of hardcoding these values.
// The database-backed Admin Settings > General row remains the single
// source of truth whenever the request succeeds; this is purely a
// resilience fallback, never a substitute for it.
const FALLBACK_SETTINGS: PublicGeneralSettings = {
  site_name: "VR's NEXORA",
  site_email: "support@vrsnexora.com",
  site_phone: "+91 90000 12345",
  site_address: "Hyderabad, Telangana, India",
  currency: "INR",
  timezone: "Asia/Kolkata",
}

/**
 * Public-site read of Admin Settings > General (site name/email/phone/
 * address/currency/timezone). Backed by React Query, so Navbar + Footer +
 * Contact (and any other consumer) share one de-duped network call and one
 * cache entry (`queryKey: ["settings", "public"]`) — no per-component
 * fetching. `settings` is always a fully-populated object (fetched data, or
 * the fallback above while loading/on error) so consumers never need to
 * null-check individual fields.
 */
export function usePublicSettings() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["settings", "public"],
    queryFn: publicWebsiteApi.getSettings,
    staleTime: 5 * 60_000,
  })

  return {
    settings: data ?? FALLBACK_SETTINGS,
    isLoading,
    isError,
  }
}
