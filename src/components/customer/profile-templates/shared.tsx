import { Briefcase, FileText, Link2, Newspaper, ShoppingBag, type LucideIcon } from "lucide-react"
import { SOCIAL_BRAND } from "@/components/customer/brand-icons"
import type { Profile } from "@/types"

/** Every profile-card template renders from this same shape — real profile
 * data only, never placeholder content (unlike the /shop marketing mockups,
 * which intentionally use "Your Name" placeholders). */
export interface TemplateProps {
  profile: Profile
  onShare: () => void
  /** Gates phone/email visibility — see DigitalCardPreview for the same contract. */
  showContactInfo?: boolean
}

export function digitsOnly(phone: string) {
  return phone.replace(/[^0-9]/g, "")
}

export function buildVCard(profile: Profile, includeContact: boolean) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${profile.fullName}`,
    `ORG:${profile.company}`,
    `TITLE:${profile.designation}`,
  ]
  if (includeContact) {
    if (profile.phone) lines.push(`TEL;TYPE=CELL:${profile.phone}`)
    if (profile.email) lines.push(`EMAIL:${profile.email}`)
  }
  if (profile.address) lines.push(`ADR;TYPE=WORK:;;${profile.address}`)
  if (profile.website) lines.push(`URL:${profile.website}`)
  lines.push("END:VCARD")
  return lines.join("\n")
}

export function downloadVCard(profile: Profile, includeContact: boolean) {
  const blob = new Blob([buildVCard(profile, includeContact)], { type: "text/vcard" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${profile.username}.vcf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Presentational heuristic only — custom links have no stored "type", so the
 * icon/color is inferred from the label text just to avoid every link looking
 * identical. Falls back to a generic link glyph. */
export function getCustomLinkVisual(label: string): { icon: LucideIcon; color: string } {
  const l = label.toLowerCase()
  if (l.includes("portfolio")) return { icon: Briefcase, color: "#1E293B" }
  if (l.includes("resume") || l.includes("cv")) return { icon: FileText, color: "#F59E0B" }
  if (l.includes("blog")) return { icon: Newspaper, color: "#2563EB" }
  if (l.includes("shop") || l.includes("store")) return { icon: ShoppingBag, color: "#8B5CF6" }
  if (l.includes("doc")) return { icon: FileText, color: "#06B6D4" }
  return { icon: Link2, color: "#14B8A6" }
}

export { SOCIAL_BRAND }

/** Derives the render-ready, sorted/filtered data every template needs —
 * kept in one place so the 9 template files can't drift on filtering rules. */
export function useProfileSections(profile: Profile, showContactInfo: boolean) {
  const enabledSocial = [...profile.socialLinks].filter((l) => l.enabled && l.url.trim()).sort((a, b) => a.order - b.order)
  const enabledCustom = [...profile.customLinks].filter((l) => l.enabled && l.url.trim()).sort((a, b) => a.order - b.order)
  const customFields = [...profile.customFields].sort((a, b) => a.order - b.order)
  const activeServices = [...profile.services].filter((s) => s.isActive).sort((a, b) => a.order - b.order)
  const showPhone = showContactInfo && Boolean(profile.phone)
  const showEmail = showContactInfo && Boolean(profile.email)
  const hasAddressInfo = Boolean(profile.address || profile.city || profile.state || profile.country)

  return { enabledSocial, enabledCustom, customFields, activeServices, showPhone, showEmail, hasAddressInfo }
}

/** Phone-frame chrome shared by every template — same bezel/notch/share
 * button DigitalCardPreview uses, so all 9 templates read as one coherent
 * "live preview" surface no matter which is selected. */
export function TemplateFrame({
  onShare,
  bodyClassName,
  children,
}: {
  onShare: () => void
  bodyClassName: string
  children: React.ReactNode
}) {
  return (
    <div className="relative mx-auto w-[300px] overflow-hidden rounded-[36px] border-[8px] border-neutral-900 bg-white shadow-xl">
      <span className="absolute left-1/2 top-1.5 z-20 h-1.5 w-16 -translate-x-1/2 rounded-full bg-neutral-900" />
      <button
        type="button"
        onClick={onShare}
        aria-label="Share profile"
        className="absolute right-4 top-4 z-10 flex size-9 items-center justify-center rounded-full border border-white/40 bg-white/90 text-primary shadow-sm backdrop-blur transition-transform hover:scale-105"
      >
        <ShareIcon />
      </button>
      <div className={bodyClassName}>{children}</div>
    </div>
  )
}

function ShareIcon() {
  // Kept local to avoid every template re-importing lucide's Share2 just for this one spot.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5" />
    </svg>
  )
}
