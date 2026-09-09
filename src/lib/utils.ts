import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Validates a `?redirect=` target before it's ever passed to navigate().
 * Only a same-app relative path ("/orders", "/checkout") is allowed — this
 * blocks open-redirect payloads like "//evil.com" or "https://evil.com"
 * that a crafted login/register link could otherwise carry.
 */
export function sanitizeRedirect(path: string | null | undefined, fallback: string): string {
  if (!path) return fallback
  if (!path.startsWith("/") || path.startsWith("//")) return fallback
  return path
}

/** `mailto:` href, or undefined when there's no email to link to — never
 *  renders a broken `mailto:` link. */
export function buildMailtoHref(email: string | undefined | null): string | undefined {
  return email ? `mailto:${email}` : undefined
}

/** `tel:` href (digits/leading + only), or undefined when there's no phone
 *  number to link to — never renders a broken `tel:` link. */
export function buildTelHref(phone: string | undefined | null): string | undefined {
  const digits = phone?.replace(/[^\d+]/g, "") ?? ""
  return digits ? `tel:${digits}` : undefined
}
