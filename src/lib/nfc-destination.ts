const PLACE_ID = /^[A-Za-z0-9_-]{1,256}$/
const MAPS_FEATURE_ID = /^0x[0-9A-Fa-f]{1,16}:0x[0-9A-Fa-f]{1,16}$/
const MAPS_REDIRECT_KEYS = new Set(["url", "continue", "redirect", "redirect_uri", "redirect_url", "next", "destination", "daddr", "saddr"])

function unsafeMapsText(value: string) {
  return Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "\\")
}

function validCid(value: string) {
  return /^[0-9]{1,20}$/.test(value) && BigInt(value) > 0n && BigInt(value) <= 18446744073709551615n
}

function mapsDestination(url: URL): string | null {
  if (!["www.google.com", "maps.google.com"].includes(url.hostname)) return null
  if (!(url.pathname === "/maps" || url.pathname.startsWith("/maps/") || (url.hostname === "maps.google.com" && url.pathname === "/"))) return null
  const entries = Array.from(url.searchParams)
  if (entries.length > 30 || entries.some(([key, value]) => MAPS_REDIRECT_KEYS.has(key.toLowerCase()) || unsafeMapsText(value))) return null
  const selectors = ["cid", "ftid", "placeid", "query_place_id"].filter((key) => url.searchParams.has(key))
  if (selectors.length > 1) return null
  for (const key of selectors) {
    const values = url.searchParams.getAll(key)
    if (values.length !== 1 || !(key === "cid" ? validCid(values[0]) : key === "ftid" ? MAPS_FEATURE_ID.test(values[0]) : PLACE_ID.test(values[0]))) return null
  }
  let search = false
  for (const key of ["q", "query"]) {
    if (url.searchParams.has(key)) {
      const values = url.searchParams.getAll(key)
      const value = values[0]
      if (values.length !== 1 || !value.trim() || value.length > 512 || value.includes("://") || value.startsWith("//")) return null
      if (value.startsWith("place_id:") && !PLACE_ID.test(value.slice(9))) return null
      search = true
    }
  }
  if (url.pathname.startsWith("/maps/place/")) {
    const tail = decodeURIComponent(url.pathname.slice("/maps/place/".length))
    if (!tail || tail.includes("://") || unsafeMapsText(tail)) return null
    if (tail.startsWith("/")) {
      const data = url.pathname.startsWith("/maps/place//data=") ? url.pathname.slice("/maps/place//data=".length) : ""
      const identifiers = Array.from(data.matchAll(/!1s([^!]+)/g), (match) => match[1])
      const identifier = identifiers[0] ?? ""
      if (!/^(?:![A-Za-z0-9_.:%-]+)+$/.test(data) || identifiers.length !== 1 || !(MAPS_FEATURE_ID.test(identifier) || (PLACE_ID.test(identifier) && (!/^[0-9]+$/.test(identifier) || validCid(identifier))))) return null
    }
  } else if (["/maps", "/maps/", "/maps/search", "/maps/search/", "/"].includes(url.pathname)) {
    if (!selectors.length && !search) return null
  } else return null
  return url.href
}

/** Public NFC responses may open a local digital profile or a validated Google Maps/review destination. */
export function safeNfcDestination(value: string, origin: string): string | null {
  if (Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === "\\")) return null
  try {
    const url = new URL(value, origin)
    if (url.username || url.password) return null
    if (url.origin === origin && /^\/u\/[^/]+\/?$/.test(url.pathname)) return url.href
    if (url.port) return null
    if (url.protocol !== "https:") return null
    if (url.hash) return null
    if (value.length > 2048) return null
    if (url.hostname === "search.google.com" && url.pathname === "/local/writereview") {
      const places = url.searchParams.getAll("placeid")
      if (places.length === 1 && /^[A-Za-z0-9_-]{1,256}$/.test(places[0])) {
        return `https://search.google.com/local/writereview?${new URLSearchParams({ placeid: places[0] })}`
      }
    }
    // Google's documented writeAReviewUri uses a Maps identifier; it is
    // distinct from the Place ID accepted by the review-form endpoint.
    const mapsReview = /^\/maps\/place\/\/data=!4m3!3m2!1s(0x[0-9A-Fa-f]{1,16}:0x[0-9A-Fa-f]{1,16}|[A-Za-z0-9_-]{1,256})!12e1$/.exec(url.pathname)
    if (["www.google.com", "maps.google.com"].includes(url.hostname) && mapsReview) {
      if (/^[0-9]+$/.test(mapsReview[1]) && (mapsReview[1].length > 20 || BigInt(mapsReview[1]) > 18446744073709551615n)) return null
      return `https://www.google.com${url.pathname}`
    }
    return mapsDestination(url)
  } catch { /* Invalid destinations stay on the error screen. */ }
  return null
}
