import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { usePublicSettings } from "@/hooks/usePublicSettings"

/**
 * Renders the Admin-uploaded Company Logo (Admin Dashboard → Settings →
 * General → Branding, backed by GeneralSettings.company_logo_url) wherever
 * the app already shows its own platform brand mark — falls back to that
 * exact existing mark (`fallback`) unchanged when no logo has been
 * uploaded, so nothing changes visually until an Admin actually sets one.
 * Every location below reads through this one component / the same
 * usePublicSettings query, so there is a single place the backend-persisted
 * logo plugs into.
 *
 * Current call sites: Navbar (public site header + mobile menu), Footer
 * (public site), Login (customer sign-in, desktop + mobile header),
 * Register (customer sign-up), AdminLogin, AdminSidebar, CustomerSidebar.
 */
export function BrandMark({ fallback, className }: { fallback: ReactNode; className?: string }) {
  const { settings } = usePublicSettings()
  if (!settings.company_logo_url) return <>{fallback}</>
  return <img src={settings.company_logo_url} alt="Company logo" className={cn("object-cover", className)} />
}
