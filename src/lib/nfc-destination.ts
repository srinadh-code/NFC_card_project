/** Public NFC responses may open a local digital profile or an approved Google destination. */
export function safeNfcDestination(value: string, origin: string): string | null {
  if (Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === "\\")) return null
  try {
    const url = new URL(value, origin)
    if (url.username || url.password) return null
    if (url.origin === origin && /^\/u\/[^/]+\/?$/.test(url.pathname)) return url.href
    if (url.port) return null
    if (url.protocol !== "https:") return null
    if (url.hash) return null
    if (url.hostname === "search.google.com" && url.pathname === "/local/writereview") {
      const places = url.searchParams.getAll("placeid")
      if (places.length === 1 && /^[A-Za-z0-9_-]{1,256}$/.test(places[0])) {
        return `https://search.google.com/local/writereview?${new URLSearchParams({ placeid: places[0] })}`
      }
    }
    // Google's documented writeAReviewUri uses a Maps identifier; it is
    // distinct from the Place ID accepted by the review-form endpoint.
    const mapsReview = /^\/maps\/place\/\/data=!4m3!3m2!1s(0x[0-9A-Fa-f]{1,16}:0x[0-9A-Fa-f]{1,16}|[A-Za-z0-9_-]{1,256})!12e1$/.exec(url.pathname)
    if (url.hostname === "www.google.com" && mapsReview) {
      if (/^[0-9]+$/.test(mapsReview[1]) && (mapsReview[1].length > 20 || BigInt(mapsReview[1]) > 18446744073709551615n)) return null
      return `https://www.google.com${url.pathname}`
    }
  } catch { /* Invalid destinations stay on the error screen. */ }
  return null
}
