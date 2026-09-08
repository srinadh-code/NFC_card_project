import {
  Share2,
  Phone,
  UserPlus,
  MessageCircle,
  Mail,
  Globe,
  ChevronRight,
  MapPin,
  Building2,
  Map as MapIcon,
  Flag,
  Navigation,
  Briefcase,
  FileText,
  Newspaper,
  ShoppingBag,
  Link2,
  type LucideIcon,
} from "lucide-react"
import { SOCIAL_BRAND } from "@/components/customer/brand-icons"
import { cn } from "@/lib/utils"
import type { Profile } from "@/types"

interface DigitalCardPreviewProps {
  profile: Profile
  onShare: () => void
  /** Gates phone/email visibility (action buttons, vCard, Contact rows) —
   * the owning customer always sees their own info in full; a visitor on the
   * public profile only sees it when the customer's privacy setting allows
   * it. Defaults to true so existing owner-facing callers don't need to pass it. */
  showContactInfo?: boolean
}

function digitsOnly(phone: string) {
  return phone.replace(/[^0-9]/g, "")
}

function buildVCard(profile: Profile, includeContact: boolean) {
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

function downloadVCard(profile: Profile, includeContact: boolean) {
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
function getCustomLinkVisual(label: string): { icon: LucideIcon; color: string } {
  const l = label.toLowerCase()
  if (l.includes("portfolio")) return { icon: Briefcase, color: "#1E293B" }
  if (l.includes("resume") || l.includes("cv")) return { icon: FileText, color: "#F59E0B" }
  if (l.includes("blog")) return { icon: Newspaper, color: "#2563EB" }
  if (l.includes("shop") || l.includes("store")) return { icon: ShoppingBag, color: "#8B5CF6" }
  if (l.includes("doc")) return { icon: FileText, color: "#06B6D4" }
  return { icon: Link2, color: "#14B8A6" }
}

function ContactRow({
  icon: Icon,
  color,
  title,
  value,
  href,
}: {
  icon: LucideIcon
  color: string
  title: string
  value: string
  href?: string
}) {
  const Comp = href ? "a" : "div"
  return (
    <Comp
      {...(href ? { href, target: href.startsWith("http") ? "_blank" : undefined, rel: "noreferrer" } : {})}
      className="flex items-center gap-3 rounded-2xl border border-border/70 bg-white p-3 shadow-[0_2px_8px_rgba(15,23,42,0.05)] transition-colors hover:border-primary/30"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: color }}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[11px] font-medium text-muted-foreground">{title}</span>
        <span className="block truncate text-sm font-semibold text-foreground">{value}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Comp>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="h-px w-4 bg-primary" />
      {children}
    </p>
  )
}

export function DigitalCardPreview({
  profile,
  onShare,
  showContactInfo = true,
}: DigitalCardPreviewProps) {
  const enabledSocial = [...profile.socialLinks]
    .filter((l) => l.enabled && l.url.trim())
    .sort((a, b) => a.order - b.order)
  const enabledCustom = [...profile.customLinks]
    .filter((l) => l.enabled && l.url.trim())
    .sort((a, b) => a.order - b.order)
  const customFields = [...profile.customFields].sort((a, b) => a.order - b.order)
  const activeServices = [...profile.services].filter((s) => s.isActive).sort((a, b) => a.order - b.order)

  const showPhone = showContactInfo && Boolean(profile.phone)
  const showEmail = showContactInfo && Boolean(profile.email)
  // Address/city/state/country are not gated behind `show_contact_info` on
  // the backend (same as the pre-existing "address" field) — only email and
  // phone are, so this checks the fields directly rather than the flag.
  const hasAddressInfo = Boolean(profile.address || profile.city || profile.state || profile.country)

  return (
    <div className="relative mx-auto w-[300px] overflow-hidden rounded-[36px] border-[8px] border-neutral-900 bg-white shadow-xl">
      <span className="absolute left-1/2 top-1.5 z-20 h-1.5 w-16 -translate-x-1/2 rounded-full bg-neutral-900" />

      <button
        type="button"
        onClick={onShare}
        aria-label="Share profile"
        className="absolute right-4 top-4 z-10 flex size-9 items-center justify-center rounded-full border border-white/40 bg-white/90 text-primary shadow-sm backdrop-blur transition-transform hover:scale-105"
      >
        <Share2 className="size-4" />
      </button>

      <div className="max-h-[660px] overflow-y-auto">
        {/* Cover banner — falls back to the brand gradient when none is set */}
        <div className="relative h-28 w-full shrink-0">
          {profile.coverImage ? (
            <img src={profile.coverImage} alt="" className="size-full object-cover" />
          ) : (
            <div className="size-full bg-gradient-brand-br" />
          )}

          {/* Company name — top-left of the banner, only when set. Capped to
              2 lines and narrower than the gap left of the centered avatar,
              so even a long name wraps in place instead of colliding with
              the avatar (which starts overlapping the banner ~54px down —
              see the -mt-[58px] on the avatar below) or the share button. */}
          {profile.company && (
            <p
              className="absolute left-4 top-3 z-0 line-clamp-2 max-w-[58%] break-words text-xs font-bold leading-snug text-white"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.45)" }}
              title={profile.company}
            >
              {profile.company}
            </p>
          )}
        </div>

        {/* Profile image overlaps the banner: ~60% of its height sits inside
            the banner, ~40% below it, per the desired card-style layout. */}
        <div className="flex flex-col items-center px-6 pb-7 pt-0 text-center">
          <img
            src={profile.avatar}
            alt={profile.fullName}
            className="relative z-[1] -mt-14 size-24 shrink-0 rounded-full border-4 border-white object-cover shadow-[0_8px_24px_rgba(15,23,42,0.2)]"
          />
          <p className="mt-4 text-lg font-bold text-foreground">{profile.fullName}</p>
          {profile.designation && <p className="text-sm font-semibold text-primary">{profile.designation}</p>}
          {profile.company && <p className="text-sm text-muted-foreground">{profile.company}</p>}
          {profile.bio && (
            <p className="mt-2 max-w-[250px] text-xs italic text-muted-foreground">&ldquo;{profile.bio}&rdquo;</p>
          )}

          {/* Action buttons */}
          <div className="mt-5 flex items-start justify-center gap-3">
            {showPhone && (
              <a href={`tel:${profile.phone}`} className="flex w-16 flex-col items-center gap-1">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#22C55E] text-white shadow-sm transition-transform hover:scale-105">
                  <Phone className="size-4" />
                </span>
                <span className="truncate text-[10px] font-medium text-muted-foreground">Call</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => downloadVCard(profile, showContactInfo)}
              className="flex w-16 flex-col items-center gap-1"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-primary transition-transform hover:scale-105">
                <UserPlus className="size-4" />
              </span>
              <span className="truncate text-[10px] font-medium text-muted-foreground">Save</span>
            </button>
            {showPhone && (
              <a
                href={`https://wa.me/${digitsOnly(profile.phone)}`}
                target="_blank"
                rel="noreferrer"
                className="flex w-16 flex-col items-center gap-1"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm transition-transform hover:scale-105">
                  <MessageCircle className="size-4" />
                </span>
                <span className="truncate text-[10px] font-medium text-muted-foreground">WhatsApp</span>
              </a>
            )}
            {showEmail && (
              <a href={`mailto:${profile.email}`} className="flex w-16 flex-col items-center gap-1">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#EA4335] text-white shadow-sm transition-transform hover:scale-105">
                  <Mail className="size-4" />
                </span>
                <span className="truncate text-[10px] font-medium text-muted-foreground">Email</span>
              </a>
            )}
          </div>

          {/* Website button */}
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex w-full items-center justify-between rounded-full bg-gradient-brand px-5 py-3 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5"
            >
              <span className="flex items-center gap-2">
                <Globe className="size-4" />
                Visit Website
              </span>
              <ChevronRight className="size-4" />
            </a>
          )}

          {/* Social links — moved directly below Visit Website */}
          {enabledSocial.length > 0 && (
            <div className="mt-7 w-full">
              <SectionLabel>Social Links</SectionLabel>
              <div className="grid grid-cols-4 gap-3">
                {enabledSocial.map((link) => {
                  const brand = SOCIAL_BRAND[link.platform]
                  const Icon = brand.icon
                  return (
                    <a
                      key={link.platform}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col items-center gap-1"
                      title={brand.label}
                    >
                      <span
                        className="flex size-11 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105"
                        style={{ background: brand.background }}
                      >
                        <Icon className={cn("size-5", brand.iconClassName)} />
                      </span>
                      <span className="truncate text-[10px] font-medium text-muted-foreground">{brand.label}</span>
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          {/* Services — what this person offers. Deliberately plain rows, no
              cards/shadows, per the "simple, clean, modern" design goal. */}
          {activeServices.length > 0 && (
            <div className="mt-7 w-full">
              <SectionLabel>Services</SectionLabel>
              <div className="space-y-3.5 text-left">
                {activeServices.map((service) => (
                  <div key={service.id} className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Briefcase className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{service.title}</p>
                      {service.description && (
                        <p className="text-xs text-muted-foreground">{service.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contact — address fields plus an "Open in Maps" action when the
              owner has set a Google Maps link. Phone/email/website already
              have their own action buttons above, so they're not repeated here. */}
          {(hasAddressInfo || profile.googleMapsUrl) && (
            <div className="mt-7 w-full">
              <SectionLabel>Contact</SectionLabel>
              <div className="space-y-2.5">
                {profile.address && <ContactRow icon={MapPin} color="#8B5CF6" title="Address" value={profile.address} />}
                {profile.city && <ContactRow icon={Building2} color="#2563EB" title="City" value={profile.city} />}
                {profile.state && <ContactRow icon={MapIcon} color="#0EA5E9" title="State" value={profile.state} />}
                {profile.country && <ContactRow icon={Flag} color="#14B8A6" title="Country" value={profile.country} />}
                {profile.googleMapsUrl && (
                  <a
                    href={profile.googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-brand px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5"
                  >
                    <Navigation className="size-4" />
                    Open in Maps
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Custom Details */}
          {customFields.length > 0 && (
            <div className="mt-7 w-full">
              <SectionLabel>Custom Details</SectionLabel>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {customFields.map((field) => (
                  <div key={field.id} className="rounded-2xl border border-border/70 bg-muted/30 px-3.5 py-2.5 text-left">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {field.label || "Untitled"}
                    </p>
                    <p className="truncate text-sm font-semibold text-foreground" title={field.value}>
                      {field.value || "—"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Remaining sections — custom links */}
          {enabledCustom.length > 0 && (
            <div className="mt-7 w-full">
              <SectionLabel>Custom Links</SectionLabel>
              <div className="grid grid-cols-4 gap-3">
                {enabledCustom.map((link) => {
                  const { icon: Icon, color } = getCustomLinkVisual(link.label)
                  return (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col items-center gap-1"
                      title={link.label}
                    >
                      <span
                        className="flex size-11 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105"
                        style={{ background: color }}
                      >
                        <Icon className="size-5" />
                      </span>
                      <span className="max-w-[56px] truncate text-[10px] font-medium text-muted-foreground">
                        {link.label}
                      </span>
                    </a>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
