import type { Order, OrderStatus, TrackingStep } from "@/types"
import type { PublicGeneralSettings } from "@/types/content"

// Shared order-tracking presentation helpers — used by the customer Orders
// page, the public Track Order page, and (for its derived fields only, not
// its own data) the Admin Order detail view. Operates purely on the
// existing `Order`/`TrackingStep` shape (@/types) — the same normalized
// shape admin's real backend orders already use (see toFrontendOrder in
// lib/api.ts) and the public Track Order page's existing mock orders
// already use, so nothing here duplicates or replaces either data source.
//
// Fields the backend genuinely does not provide yet (a tracking number, a
// named courier, a precise route distance in km) are deliberately never
// invented here — see deriveCurrentStatus/estimateDelivery below, which
// only ever compute from real order fields (status, tracking, placed_at,
// address, shipping) plus fixed, non-order-specific policy text (the same
// kind of fixed copy the site already uses for things like "7 Days
// Return"). Callers should render tracking number/courier only if the
// order object actually carries them (it doesn't, today) rather than
// falling back to a placeholder.

// The dispatch point every order ships from — admin-configurable at
// Admin Settings > General > Office / Dispatch Address (see
// website_content.models.GeneralSettings' office_* fields on the backend).
// Never hardcoded here: every caller derives it from the live public
// settings payload via deriveOfficeAddress() below, so an admin edit is
// reflected everywhere immediately without a frontend deploy.
export interface OfficeAddress {
  name: string
  line1: string
  line2: string
  landmark: string
  locality: string
  city: string
  district: string
  state: string
  pincode: string
  country: string
  phone: string
}

export function deriveOfficeAddress(settings: PublicGeneralSettings): OfficeAddress {
  return {
    name: settings.office_name,
    line1: settings.office_address_line1,
    line2: settings.office_address_line2,
    landmark: settings.office_landmark,
    locality: settings.office_locality,
    city: settings.office_city,
    district: settings.office_district,
    state: settings.office_state,
    pincode: settings.office_pincode,
    country: settings.office_country,
    phone: settings.office_phone,
  }
}

/** Short "City, State" form — for compact route-visual labels. */
export function officeShortLine(office: OfficeAddress): string {
  return [office.city, office.state].filter(Boolean).join(", ")
}

/** Full multi-part "From" line for the Shipping Information card — omits
 * any part the admin hasn't filled in rather than showing a blank. */
export function officeFullLine(office: OfficeAddress): string {
  const cityDistrict = [office.city, office.district && office.district !== office.city ? office.district : ""]
    .filter(Boolean)
    .join(", ")
  const statePincode = [office.state, office.pincode].filter(Boolean).join(" - ")
  return [office.name, office.line1, office.line2, office.landmark, office.locality, cityDistrict, statePincode, office.country]
    .filter((part) => part && part.trim())
    .join(", ")
}

// Fixed, general policy copy (not a per-order promise) — same category of
// static text as the site's existing "7 Days Return"/"Free Shipping"
// trust badges.
export const PROCESSING_TIME_LABEL = "2–3 Business Days"
export const COURIER_TRANSIT_LABEL = "3–5 Business Days"

export type TrackingKind = "cancelled" | "delivered" | "in-progress"

export interface CurrentStatus {
  label: string
  kind: TrackingKind
  /** Index into order.tracking of the current/most-recent step, or -1 for a cancelled order (no step is "current"). */
  index: number
}

/** The one canonical "where is this order right now" derivation — every
 * view (customer, public, admin) should call this rather than each
 * re-deriving it slightly differently from order.status/tracking.
 *
 * "Current" is the most recently *reached* step (the last one marked
 * `done`), not the next upcoming one — an order the backend has marked
 * Shipped is currently AT "Shipped" (✓ and Current together), not "in
 * transit toward" the next pending step. Only once every step is done does
 * it read as fully "delivered". */
export function deriveCurrentStatus(order: Order): CurrentStatus {
  if (order.status === "Cancelled") {
    return { label: "Cancelled", kind: "cancelled", index: -1 }
  }
  const steps = order.tracking
  const lastIndex = steps.length - 1
  if (steps[lastIndex]?.done) {
    return { label: steps[lastIndex].label, kind: "delivered", index: lastIndex }
  }
  let lastDoneIndex = -1
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].done) lastDoneIndex = i
  }
  const index = lastDoneIndex === -1 ? 0 : lastDoneIndex
  return { label: steps[index]?.label ?? "Order Placed", kind: "in-progress", index }
}

/** A real order date + a fixed, stated processing/transit policy window —
 * an honest *estimate*, not a per-order figure the backend actually
 * tracks. Returns null if `order.date` can't be parsed. */
export function estimateDeliveryWindow(order: Order): { from: Date; to: Date } | null {
  const placed = new Date(order.date)
  if (Number.isNaN(placed.getTime())) return null
  const from = new Date(placed)
  from.setDate(from.getDate() + 5) // fastest: 2 processing + 3 transit
  const to = new Date(placed)
  to.setDate(to.getDate() + 9) // slowest: 3 processing + 5 transit +1 buffer
  return { from, to }
}

export function isProblemStatus(status: OrderStatus): boolean {
  return status === "Cancelled"
}

/** Destination as a single display line — always real (the order's own
 * shipping address), never invented. */
export function destinationLine(order: Order): string {
  return [order.address.city, order.address.state].filter(Boolean).join(", ")
}

export function stepTimestamp(step: TrackingStep): string | null {
  return step.date
}

/** The real "Delivered On" timestamp — the completed "Delivered" tracking
 * step's own date, straight from the backend's tracking array. Null until
 * the order actually reaches that step. */
export function deliveredAt(order: Order): string | null {
  const step = order.tracking.find((s) => s.label === "Delivered" && s.done)
  return step?.date ?? null
}
