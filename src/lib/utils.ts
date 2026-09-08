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
