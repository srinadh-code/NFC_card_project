import {
  ArrowRight,
  Briefcase,
  ChevronRight,
  Download,
  Globe,
  GraduationCap,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  User,
  UserPlus,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { CustomField } from "@/types"
import {
  digitsOnly,
  downloadVCard,
  getCustomLinkVisual,
  SOCIAL_BRAND,
  TemplateFrame,
  useProfileSections,
  type TemplateProps,
} from "./shared"

/** Impact — premium geometric business card. A single reusable component
 * with 4 switchable color themes (`profile.impactTheme`), same approach as
 * Template 1/LuxuryTemplate.tsx and Template 2/Template2.tsx. Deliberately
 * does not render the shared BodySections block (Services/extra Custom
 * Fields/Custom Links) — this design has its own fixed section set with no
 * room for a generic block, so a customer's non-matched custom fields
 * (e.g. "GST Number") won't show here. Experience/Education/Availability/
 * Tagline are sourced from CustomField by label match rather than new
 * dedicated Profile fields — see the plan's scope note. */

interface ImpactThemeConfig {
  // Header/footer diagonal shapes — Primary (base) + Secondary (wedge).
  headerPrimary: string
  headerSecondary: string
  headerTextColor: string
  // Content-area accent — CREATE text, dividers, status dot, designation
  // text, CTA gradient, Call icon.
  highlight: string
  highlightTo: string
  ctaTextClass: string
  ink: string
  inkSoftClass: string
  border: string
  cardBg: string
  cardSurface: string
}

const IMPACT_THEMES: Record<"red" | "blue" | "black" | "white", ImpactThemeConfig> = {
  red: {
    headerPrimary: "#DC2626",
    headerSecondary: "#991B1B",
    headerTextColor: "#FFFFFF",
    highlight: "#DC2626",
    highlightTo: "#991B1B",
    ctaTextClass: "text-white",
    ink: "#0F172A",
    inkSoftClass: "text-slate-500",
    border: "#E5E7EB",
    cardBg: "bg-white",
    cardSurface: "bg-white",
  },
  blue: {
    headerPrimary: "#2563EB",
    headerSecondary: "#1E40AF",
    headerTextColor: "#FFFFFF",
    highlight: "#2563EB",
    highlightTo: "#1E40AF",
    ctaTextClass: "text-white",
    ink: "#0F172A",
    inkSoftClass: "text-slate-500",
    border: "#E5E7EB",
    cardBg: "bg-white",
    cardSurface: "bg-white",
  },
  black: {
    headerPrimary: "#111827",
    headerSecondary: "#000000",
    headerTextColor: "#FFFFFF",
    // Monochrome content accent (not a bright color) — "White Highlights"
    // shows up on the CTA button instead, where white text/icons sit on
    // this dark gradient for a premium executive look.
    highlight: "#111827",
    highlightTo: "#000000",
    ctaTextClass: "text-white",
    ink: "#0F172A",
    inkSoftClass: "text-slate-500",
    border: "#E5E7EB",
    cardBg: "bg-white",
    cardSurface: "bg-white",
  },
  white: {
    // Near-invisible header (minimal look) — dark ink/header text carries
    // legibility instead of a bold header color.
    headerPrimary: "#F8FAFC",
    headerSecondary: "#E2E8F0",
    headerTextColor: "#0F172A",
    highlight: "#2563EB",
    highlightTo: "#1D4ED8",
    ctaTextClass: "text-white",
    ink: "#0F172A",
    inkSoftClass: "text-slate-500",
    border: "#E2E8F0",
    cardBg: "bg-[#F8FAFC]",
    cardSurface: "bg-white",
  },
}

// Not per-profile data — decorative brand copy fixed for every card, same
// treatment as Template 2's header tagline/footer message.
const HEADER_SUBTITLE = "Digital Identity"
const VALUES_LEFT = ["CONNECT", "CREATE", "GROW"]
const FOOTER_MESSAGE = "CONNECT • COLLABORATE • CREATE"

// Fixed real-world color + soft tinted card background per contact action
// — Call/WhatsApp/Save Contact are green (the universal "positive contact
// action" convention), Email is red, independent of the active theme.
const GREEN_ACTION = { color: "#16A34A", bg: "#ECFDF5" }
const RED_ACTION = { color: "#DC2626", bg: "#FEF2F2" }
const WHATSAPP_ACTION = { color: SOCIAL_BRAND.WhatsApp.background, bg: "#ECFDF5" }

// Unique "Find Me On" treatment for Impact — premium gradient squircles
// with a glass highlight and a colored glow, deliberately distinct from
// Template 1/2's flat-color circular chips. One {gradient, glow} pair per
// known platform, plus Location (not a social platform, but shown in the
// same grid alongside profile.website and the customer's own custom links).
const LINK_TILE_STYLES: Record<string, { gradient: string; glow: string }> = {
  LinkedIn: { gradient: "linear-gradient(135deg, #2FA0E8, #0A66C2 55%, #004182)", glow: "#0A66C2" },
  Instagram: { gradient: SOCIAL_BRAND.Instagram.background, glow: "#D62976" },
  Facebook: { gradient: "linear-gradient(135deg, #4599FF, #1877F2 55%, #0C44A0)", glow: "#1877F2" },
  WhatsApp: { gradient: "linear-gradient(135deg, #4ADE80, #25D366 55%, #0E9F52)", glow: "#25D366" },
  YouTube: { gradient: "linear-gradient(135deg, #FF6B6B, #FF0000 55%, #B30000)", glow: "#FF0000" },
  Twitter: { gradient: "linear-gradient(135deg, #4A4A4A, #1A1A1A 55%, #000000)", glow: "#3F3F3F" },
  GitHub: { gradient: "linear-gradient(135deg, #6B7280, #374151 55%, #111827)", glow: "#374151" },
  Telegram: { gradient: "linear-gradient(135deg, #6FC6F4, #229ED9 55%, #157CAB)", glow: "#229ED9" },
  Website: { gradient: "linear-gradient(135deg, #C4B5FD, #8B5CF6 55%, #6D28D9)", glow: "#8B5CF6" },
  Location: { gradient: "linear-gradient(135deg, #5EEAD4, #14B8A6 55%, #0F766E)", glow: "#14B8A6" },
}

function darkenHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16)
  const clamp = (c: number) => Math.max(0, Math.min(255, Math.floor(c * (1 - amount))))
  const r = clamp((n >> 16) & 255)
  const g = clamp((n >> 8) & 255)
  const b = clamp(n & 255)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

function findCustomFieldValue(fields: CustomField[], label: string): string | undefined {
  const match = fields.find((f) => f.label.trim().toLowerCase() === label.toLowerCase())
  return match?.value.trim() || undefined
}

function SectionHeading({ icon: Icon, title, color }: { icon: typeof User; title: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm font-bold" style={{ color }}>
        <Icon className="size-4" style={{ color }} />
        {title}
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </div>
  )
}

export default function ImpactTemplate({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const theme = IMPACT_THEMES[profile.impactTheme] ?? IMPACT_THEMES.red
  const { enabledSocial, enabledCustom, showPhone, showEmail } = useProfileSections(profile, showContactInfo)
  const companyLabel = profile.company || "VR's NEXORA"

  const tagline = findCustomFieldValue(profile.customFields, "Tagline")
  const experience = findCustomFieldValue(profile.customFields, "Experience")
  const education = findCustomFieldValue(profile.customFields, "Education")
  const availability = findCustomFieldValue(profile.customFields, "Availability")
  const location = [profile.city, profile.state].filter(Boolean).join(", ") || undefined

  const quickActions = [
    showPhone && { key: "call", label: "Call", icon: Phone, ...GREEN_ACTION, href: `tel:${profile.phone}` },
    showPhone && {
      key: "whatsapp",
      label: "WhatsApp",
      icon: MessageCircle,
      ...WHATSAPP_ACTION,
      href: `https://wa.me/${digitsOnly(profile.phone)}`,
      external: true,
    },
    showEmail && { key: "email", label: "Email", icon: Mail, ...RED_ACTION, href: `mailto:${profile.email}` },
    {
      key: "save",
      label: "Save Contact",
      icon: UserPlus,
      ...GREEN_ACTION,
      onClick: () => downloadVCard(profile, showContactInfo),
    },
  ].filter(Boolean) as Array<{
    key: string
    label: string
    icon: typeof Phone
    color: string
    bg: string
    href?: string
    external?: boolean
    onClick?: () => void
  }>

  const stats = [
    experience && { key: "experience", icon: Briefcase, label: "Experience", value: experience },
    education && { key: "education", icon: GraduationCap, label: "Education", value: education },
    location && { key: "location", icon: MapPin, label: "Location", value: location },
    availability && { key: "availability", icon: Send, label: "Availability", value: availability },
  ].filter(Boolean) as Array<{ key: string; icon: typeof Briefcase; label: string; value: string }>

  // "Find Me On" — every enabled social platform, plus profile.website and
  // Location (same redundant-but-consistent inclusion Template 2 uses) and
  // the customer's own custom links, all in one unified grid.
  const linkTiles = [
    ...enabledSocial.map((link) => {
      const brand = SOCIAL_BRAND[link.platform]
      const style = LINK_TILE_STYLES[link.platform] ?? { gradient: brand.background, glow: "#111827" }
      return { key: link.platform, label: brand.label, icon: brand.icon, iconClassName: brand.iconClassName, ...style, href: link.url }
    }),
    profile.website && { key: "website", label: "Website", icon: Globe, ...LINK_TILE_STYLES.Website, href: profile.website },
    profile.googleMapsUrl && {
      key: "location-link",
      label: "Location",
      icon: MapPin,
      ...LINK_TILE_STYLES.Location,
      href: profile.googleMapsUrl,
    },
    ...enabledCustom.map((link) => {
      const visual = getCustomLinkVisual(link.label)
      return {
        key: `custom-${link.id}`,
        label: link.label,
        icon: visual.icon,
        gradient: `linear-gradient(135deg, ${visual.color}, ${darkenHex(visual.color, 0.35)})`,
        glow: visual.color,
        href: link.url,
      }
    }),
  ].filter(Boolean) as Array<{
    key: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    iconClassName?: string
    gradient: string
    glow: string
    href: string
  }>

  return (
    <TemplateFrame onShare={onShare} bodyClassName={cn("max-h-[660px] overflow-y-auto", theme.cardBg)}>
      <div className="relative">
        <div className="h-[168px] w-full overflow-hidden">
          {/* Layered two-tone diagonal: Primary fills the header, a
              Secondary wedge covers the top-left corner behind the
              logo/text. */}
          <div className="absolute inset-0" style={{ background: theme.headerPrimary }} />
          <div
            className="absolute inset-0"
            style={{ background: theme.headerSecondary, clipPath: "polygon(0 0, 58% 0, 0 78%)" }}
          />
          {/* Share is TemplateFrame's own corner button (every template
              shares one) — no second share control here. */}
          <div className="absolute inset-0 flex items-start p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow-primary">
                <Zap className="size-5" fill="currentColor" />
              </span>
              <div className="min-w-0">
                <p className="max-w-[150px] truncate text-sm font-bold" style={{ color: theme.headerTextColor }}>
                  {companyLabel}
                </p>
                <p className="text-[10px]" style={{ color: theme.headerTextColor, opacity: 0.7 }}>
                  {HEADER_SUBTITLE}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Positioned against this outer (non-clipping) wrapper, not the
            header's own overflow-hidden box, and not via a negative margin
            either — both would get the bottom half clipped by the body's
            overflow-y-auto scroll boundary. Same fix as Template 1/Luxury
            and Template 2. Straddles the header/content boundary: half the
            circle sits on the banner, half on the white content area. */}
        <div className="absolute left-1/2 top-[168px] -translate-x-1/2 -translate-y-1/2">
          <div className="relative inline-block">
            <img
              src={profile.avatar}
              alt={profile.fullName}
              className="size-40 rounded-full border-4 border-white object-cover shadow-lg"
            />
            <span
              className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full border-2 border-white"
              style={{ background: theme.highlight }}
            />
          </div>
        </div>
      </div>

      <div className="relative px-6 pb-7 pt-3">
        {/* A small wedge bleeding down from the header's left edge into the
            content area, behind the CONNECT/CREATE/GROW column — same
            layered-geometry motif as the header/footer. */}
        <div
          className="pointer-events-none absolute left-0 top-0 size-16"
          style={{ background: theme.headerPrimary, clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
        />
        <div className="relative flex min-h-11 flex-col justify-center text-left text-xs font-bold uppercase leading-[1.5]" style={{ color: theme.ink }}>
          {VALUES_LEFT.map((word) => (
            <p key={word} style={word === "CREATE" ? { color: theme.highlight } : undefined}>
              {word}
            </p>
          ))}
          <div className="mt-1 h-0.5 w-8" style={{ background: theme.highlight }} />
        </div>

        {/* Clears the overlapping avatar above (size-40, centered on the
            header/content boundary) before the name starts. */}
        <div className="mt-6" />

        <div className="text-center">
          <p className="text-2xl font-black" style={{ color: theme.ink }}>
            {profile.fullName}
          </p>
          {profile.designation && (
            <p className="mt-1 text-sm font-bold" style={{ color: theme.highlight }}>
              {profile.designation}
            </p>
          )}
          {profile.company && <p className={cn("text-sm", theme.inkSoftClass)}>{profile.company}</p>}
          <div className="mx-auto mt-3 h-0.5 w-10" style={{ background: theme.highlight }} />
          {tagline && (
            <p className={cn("mt-3 text-sm italic leading-relaxed", theme.inkSoftClass)}>&ldquo;{tagline}&rdquo;</p>
          )}
        </div>

        {quickActions.length > 0 && (
          <div className="mt-6 grid grid-cols-4 gap-2">
            {quickActions.map((action) => {
              const Icon = action.icon
              const content = (
                <>
                  <Icon className="size-5" style={{ color: action.color }} />
                  <span className="text-center text-[10px] font-semibold leading-tight" style={{ color: theme.ink }}>
                    {action.label}
                  </span>
                </>
              )
              const cardClass =
                "flex flex-col items-center justify-center gap-1.5 rounded-2xl py-4 shadow-sm transition-transform hover:-translate-y-0.5"
              return action.href ? (
                <a
                  key={action.key}
                  href={action.href}
                  target={action.external ? "_blank" : undefined}
                  rel={action.external ? "noreferrer" : undefined}
                  className={cardClass}
                  style={{ background: action.bg }}
                >
                  {content}
                </a>
              ) : (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.onClick}
                  className={cardClass}
                  style={{ background: action.bg }}
                >
                  {content}
                </button>
              )
            })}
          </div>
        )}

        {profile.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "mt-4 flex w-full items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-bold shadow-sm transition-transform hover:-translate-y-0.5",
              theme.ctaTextClass,
            )}
            style={{ background: `linear-gradient(90deg, ${theme.highlight}, ${theme.highlightTo})` }}
          >
            <Globe className="size-4" />
            Visit Website
            <ArrowRight className="size-4" />
          </a>
        )}

        {stats.length > 0 && (
          <div className={cn("mt-5 overflow-hidden rounded-2xl shadow-sm", theme.cardSurface)}>
            {stats.map((stat, i) => {
              const Icon = stat.icon
              return (
                <div
                  key={stat.key}
                  className="flex items-center gap-3 px-4 py-3"
                  style={i > 0 ? { borderTop: `1px solid ${theme.border}` } : undefined}
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: `${theme.highlight}1A` }}
                  >
                    <Icon className="size-4" style={{ color: theme.highlight }} />
                  </span>
                  <span className="h-6 w-px shrink-0" style={{ background: theme.border }} />
                  <span className="min-w-0">
                    {/* "Location" is self-explanatory next to a pin icon —
                        every other stat keeps its label for context. */}
                    {stat.key !== "location" && (
                      <span className={cn("block text-[10px] uppercase tracking-wide", theme.inkSoftClass)}>
                        {stat.label}
                      </span>
                    )}
                    <span className="block truncate text-sm font-bold" style={{ color: theme.ink }}>
                      {stat.value}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {profile.bio && (
          <div className={cn("mt-5 rounded-2xl p-4 shadow-sm", theme.cardSurface)}>
            <SectionHeading icon={User} title="About Me" color={theme.ink} />
            <p className={cn("mt-2 text-sm leading-relaxed", theme.inkSoftClass)}>{profile.bio}</p>
          </div>
        )}

        {linkTiles.length > 0 && (
          <div className="mt-5 mb-6">
            <SectionHeading icon={Link2} title="Find Me On" color={theme.ink} />
            {/* Premium glassmorphism squircles — deliberately distinct from
                Template 1/2's flat circular chips. Exactly 5 per row on
                mobile via a fixed grid-cols-5; extra tiles wrap onto
                further rows automatically. */}
            <div className="mt-4 grid grid-cols-5 gap-2.5">
              {linkTiles.map((tile) => {
                const Icon = tile.icon
                return (
                  <a
                    key={tile.key}
                    href={tile.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex flex-col items-center gap-1.5"
                    title={tile.label}
                  >
                    <span
                      className="relative flex size-10 items-center justify-center overflow-hidden rounded-[14px] text-white ring-1 ring-white/30 transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:scale-110"
                      style={{ background: tile.gradient, boxShadow: `0 8px 16px -6px ${tile.glow}80` }}
                    >
                      {/* Glass highlight sweep */}
                      <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/35 via-white/5 to-transparent" />
                      <Icon className={cn("relative size-4.5", tile.iconClassName)} />
                    </span>
                    <span
                      className={cn("w-full truncate text-center text-[8.5px] font-medium leading-tight", theme.inkSoftClass)}
                    >
                      {tile.label}
                    </span>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => downloadVCard(profile, showContactInfo)}
          className={cn(
            "mt-6 flex w-full items-center justify-center gap-2 rounded-full border py-3.5 text-sm font-bold shadow-sm transition-transform hover:-translate-y-0.5",
            theme.cardSurface,
          )}
          style={{ color: theme.ink, borderColor: theme.border }}
        >
          <Download className="size-4" />
          Download vCard
          <ArrowRight className="size-4" />
        </button>
      </div>

      <div className="relative mt-2 h-16 w-full overflow-hidden">
        {/* Same layered two-tone diagonal treatment as the header, mirrored
            at the bottom this time. */}
        <div className="absolute inset-0" style={{ background: theme.headerSecondary }} />
        <div
          className="absolute inset-0"
          style={{ background: theme.headerPrimary, clipPath: "polygon(100% 0, 100% 65%, 35% 0)" }}
        />
        <div
          className="absolute bottom-0 left-0 size-9"
          style={{ background: theme.headerPrimary, clipPath: "polygon(0 0, 100% 100%, 0 100%)" }}
        />
        <div className="absolute inset-0 flex items-center justify-center gap-3 px-6">
          <span className="h-px flex-1" style={{ background: theme.headerTextColor, opacity: 0.25 }} />
          <span
            className="shrink-0 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: theme.headerTextColor, opacity: 0.8 }}
          >
            {FOOTER_MESSAGE}
          </span>
          <span className="h-px flex-1" style={{ background: theme.headerTextColor, opacity: 0.25 }} />
        </div>
      </div>
    </TemplateFrame>
  )
}
