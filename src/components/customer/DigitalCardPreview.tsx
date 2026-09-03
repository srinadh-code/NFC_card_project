import {
  Share2,
  Phone,
  UserPlus,
  MessageCircle,
  Mail,
  Globe,
  ChevronRight,
  MapPin,
  Download,
  Briefcase,
  FileText,
  Newspaper,
  ShoppingBag,
  Link2,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { SOCIAL_BRAND } from "@/components/customer/brand-icons"
import { cn } from "@/lib/utils"
import type { Profile } from "@/types"

interface DigitalCardPreviewProps {
  profile: Profile
  qrDataUrl?: string
  downloading?: boolean
  onDownloadQr: () => void
  onShare: () => void
}

function digitsOnly(phone: string) {
  return phone.replace(/[^0-9]/g, "")
}

function buildVCard(profile: Profile) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${profile.fullName}`,
    `ORG:${profile.company}`,
    `TITLE:${profile.designation}`,
  ]
  if (profile.phone) lines.push(`TEL;TYPE=CELL:${profile.phone}`)
  if (profile.email) lines.push(`EMAIL:${profile.email}`)
  if (profile.address) lines.push(`ADR;TYPE=WORK:;;${profile.address}`)
  if (profile.website) lines.push(`URL:${profile.website}`)
  lines.push("END:VCARD")
  return lines.join("\n")
}

function downloadVCard(profile: Profile) {
  const blob = new Blob([buildVCard(profile)], { type: "text/vcard" })
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

export function DigitalCardPreview({ profile, qrDataUrl, downloading, onDownloadQr, onShare }: DigitalCardPreviewProps) {
  const enabledSocial = [...profile.socialLinks]
    .filter((l) => l.enabled && l.url.trim())
    .sort((a, b) => a.order - b.order)
  const enabledCustom = [...profile.customLinks]
    .filter((l) => l.enabled && l.url.trim())
    .sort((a, b) => a.order - b.order)

  const hasContactInfo = Boolean(profile.address || profile.email || profile.phone || profile.website)

  return (
    <div className="relative mx-auto w-[300px] overflow-hidden rounded-[36px] border-[8px] border-neutral-900 bg-white shadow-xl">
      <span className="absolute left-1/2 top-1.5 z-20 h-1.5 w-16 -translate-x-1/2 rounded-full bg-neutral-900" />

      <button
        type="button"
        onClick={onShare}
        aria-label="Share profile"
        className="absolute right-4 top-4 z-10 flex size-9 items-center justify-center rounded-full border border-border bg-white text-primary shadow-sm transition-transform hover:scale-105"
      >
        <Share2 className="size-4" />
      </button>

      <div className="max-h-[660px] overflow-y-auto">
        <div className="flex flex-col items-center px-6 pb-7 pt-9 text-center">
          <img
            src={profile.avatar}
            alt={profile.fullName}
            className="size-24 rounded-full border-4 border-white object-cover shadow-[0_8px_24px_rgba(15,23,42,0.15)]"
          />
          <p className="mt-4 text-lg font-bold text-foreground">{profile.fullName}</p>
          {profile.designation && <p className="text-sm font-semibold text-primary">{profile.designation}</p>}
          {profile.company && <p className="text-sm text-muted-foreground">{profile.company}</p>}
          {profile.bio && (
            <p className="mt-2 max-w-[250px] text-xs italic text-muted-foreground">&ldquo;{profile.bio}&rdquo;</p>
          )}

          {/* Action buttons */}
          <div className="mt-5 flex items-start justify-center gap-3">
            {profile.phone && (
              <a href={`tel:${profile.phone}`} className="flex w-16 flex-col items-center gap-1">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#22C55E] text-white shadow-sm transition-transform hover:scale-105">
                  <Phone className="size-4" />
                </span>
                <span className="truncate text-[10px] font-medium text-muted-foreground">Call</span>
              </a>
            )}
            <button type="button" onClick={() => downloadVCard(profile)} className="flex w-16 flex-col items-center gap-1">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-primary transition-transform hover:scale-105">
                <UserPlus className="size-4" />
              </span>
              <span className="truncate text-[10px] font-medium text-muted-foreground">Save</span>
            </button>
            {profile.phone && (
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
            {profile.email && (
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

          {/* Contact information */}
          {hasContactInfo && (
            <div className="mt-7 w-full">
              <SectionLabel>Contact</SectionLabel>
              <div className="space-y-2.5">
                {profile.address && <ContactRow icon={MapPin} color="#8B5CF6" title="Address" value={profile.address} />}
                {profile.email && (
                  <ContactRow icon={Mail} color="#EA4335" title="Email" value={profile.email} href={`mailto:${profile.email}`} />
                )}
                {profile.phone && (
                  <ContactRow icon={Phone} color="#22C55E" title="Phone" value={profile.phone} href={`tel:${profile.phone}`} />
                )}
                {profile.website && (
                  <ContactRow icon={Globe} color="#2563EB" title="Website" value={profile.website} href={profile.website} />
                )}
              </div>
            </div>
          )}

          {/* Social links */}
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

          {/* Custom links */}
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

          {/* QR code */}
          <div className="mt-7 w-full rounded-2xl border border-border/70 bg-muted/30 p-4">
            <SectionLabel>QR Code</SectionLabel>
            <div className="flex items-center gap-3">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Profile QR code" className="size-16 rounded-lg border border-border bg-white p-1" />
              ) : (
                <div className="size-16 shrink-0 animate-pulse rounded-lg bg-muted" />
              )}
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-semibold text-foreground">Scan to save my contact</p>
                <p className="text-xs text-muted-foreground">Share my profile instantly</p>
                <Button size="sm" variant="soft" className="mt-2" onClick={onDownloadQr} disabled={downloading}>
                  <Download className="size-3.5" />
                  {downloading ? "Preparing…" : "Download QR"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
