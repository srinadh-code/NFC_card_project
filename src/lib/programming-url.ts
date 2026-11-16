/** A server-generated NFC programming link can be shown before card activation. */
export function safeProgrammingUrl(value: string | null | undefined): string | null {
  if (!value || Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === "\\")) return null
  try {
    const url = new URL(value)
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null
    if (url.username || url.password || url.search || url.hash || !/^\/nfc\/[^/]+\/?$/.test(url.pathname)) return null
    return url.href
  } catch { return null }
}
