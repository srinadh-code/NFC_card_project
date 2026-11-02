import { MapPin } from "lucide-react"
import type { CustomerAddress } from "@/types"

/** "View pinned location" for an address saved with a map pin (Choose on
 * Map / current location). Renders nothing for a typed-only address. */
export function PinnedLocationLink({ address }: { address: Pick<CustomerAddress, "latitude" | "longitude"> }) {
  if (address.latitude === null || address.longitude === null) return null
  const query = `${address.latitude},${address.longitude}`
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
    >
      <MapPin className="size-3.5" /> View pinned location
    </a>
  )
}
