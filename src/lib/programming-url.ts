/** A physical NFC card must use the server's public HTTPS programming link. */
export function safeProgrammingUrl(value: string | null | undefined): string | null {
  if (!value || Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === "\\")) return null
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/\.$/, "")
    if (url.protocol !== "https:" || url.port || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")) return null
    if (!host.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null
    if (["localhost", "local", "internal", "localdomain"].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return null
    if (url.username || url.password || url.search || url.hash || !/^\/nfc\/[^/]+\/?$/.test(url.pathname)) return null
    return url.href
  } catch { return null }
}
