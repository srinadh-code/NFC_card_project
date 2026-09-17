import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useBrandingStore } from "@/store/branding-store"

/**
 * Renders the Admin-uploaded Company Logo (Admin Dashboard → Settings →
 * General → Branding) wherever the app already shows its own platform
 * brand mark — falls back to that exact existing mark (`fallback`)
 * unchanged when no logo has been uploaded, so nothing changes visually
 * until an Admin actually sets one. Every location below reads through
 * this one component / the same useBrandingStore, so there is a single
 * place a future backend-persisted logo would need to plug into.
 *
 * Current call sites: Navbar (public site header + mobile menu), Footer
 * (public site), Login (customer sign-in, desktop + mobile header),
 * Register (customer sign-up), AdminLogin, AdminSidebar, CustomerSidebar.
 */
export function BrandMark({ fallback, className }: { fallback: ReactNode; className?: string }) {
  const companyLogo = useBrandingStore((s) => s.companyLogo)
  if (!companyLogo) return <>{fallback}</>
  return <img src={companyLogo.previewUrl} alt="Company logo" className={cn("object-cover", className)} />
}
