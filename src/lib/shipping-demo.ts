import type { Order } from "@/types"

// ---------------------------------------------------------------------
// FRONTEND-ONLY DEMO FALLBACK — clearly isolated from real API data.
//
// The backend order API (see ApiAdminOrder in lib/api.ts) does not return
// distance_km or a named courier for any order — this file is the ONLY
// place those two values are produced, deterministically from the order's
// own real fields (id, address city), never randomly, so the same order
// always shows the same demo value on every reload and to both the Admin
// and the Customer.
//
// A real, per-order public identifier now DOES exist on the backend —
// Order.order_number (e.g. "NXTRK250344", see orders/models.py) — so it is
// read directly off `Order.orderNumber` wherever it's needed (order
// headers, "Copy Order ID", the public /track-order lookup key) instead of
// being invented here. This module used to also fabricate a fake
// "tracking number" before that real field existed; that function is gone
// now that it would just be a redundant, less-real duplicate of
// order_number.
//
// Nothing here is sent to the backend, persisted anywhere, or presented
// as if a real courier produced it (the UI always labels it "estimated" /
// "demo"). The day a real courier integration provides distance/courier
// name, every call site importing from this file should switch to reading
// them straight off `Order` instead — this module can then be deleted.
// ---------------------------------------------------------------------

// Straight-line reference distances (km) from the single fixed dispatch
// origin (Hyderabad, Telangana — see SHIPPING_ORIGIN in order-tracking.ts)
// to major Indian destination cities. A static lookup, not a maps/geocoding
// API call — this task explicitly disallows adding one.
const CITY_DISTANCE_KM: Record<string, number> = {
  hyderabad: 15,
  secunderabad: 12,
  mumbai: 708,
  "navi mumbai": 720,
  delhi: 1500,
  "new delhi": 1500,
  bengaluru: 570,
  bangalore: 570,
  chennai: 625,
  kolkata: 1500,
  pune: 560,
  ahmedabad: 1040,
  jaipur: 1300,
  lucknow: 1300,
  surat: 1120,
  visakhapatnam: 350,
  vijayawada: 275,
  vizag: 350,
  chandigarh: 1580,
  kochi: 700,
  cochin: 700,
  coimbatore: 630,
  nagpur: 500,
  bhopal: 780,
  indore: 830,
  guntur: 260,
  warangal: 140,
}

/** Stable (non-random) hash of a string — keeps a per-order demo value
 * fixed across reloads and identical between the Admin and Customer view
 * of the same order, instead of changing on every render. */
function stableHash(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

/** Demo delivery distance in km. Looks up the order's real destination
 * city; falls back to a stable (never zero/blank) estimate for a city not
 * in the lookup, so the UI always has something to show. */
export function getDemoDistanceKm(order: Order): number {
  const city = order.address.city.trim().toLowerCase()
  const known = CITY_DISTANCE_KM[city]
  if (known !== undefined) return known
  return 400 + (stableHash(city || order.id) % 1200)
}

// A generic placeholder rather than naming a specific real courier brand —
// this project has no actual courier integration yet, so it never implies
// one.
export const DEMO_COURIER_NAME = "Courier Partner"

export const SHIPPING_DEMO_DISCLAIMER = "Courier name is shown for demo purposes until a live courier integration is connected."
