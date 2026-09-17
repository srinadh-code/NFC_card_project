import { Mail, MapPin, MessageCircle, Phone, Share2, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { digitsOnly, downloadVCard, SOCIAL_BRAND, TemplateFrame, useProfileSections, type TemplateProps } from "./shared"

// Real-world associated color per contact action (same values
// LuxuryTemplate.tsx's Quick Actions use) so Call/WhatsApp/Email stay
// recognizable at a glance regardless of the active color theme — the
// pill's border/label stay theme-colored, only the icon glyph is tinted.
const CONTACT_ACTION_COLORS = {
  call: "#22C55E",
  whatsapp: SOCIAL_BRAND.WhatsApp.background,
  email: "#EF4444",
} as const

// "Website" is coincidentally already one of the registered social
// platforms (brand-icons.tsx) — reuse its icon/color for profile.website
// too, rather than inventing a second, inconsistent "website" visual.
const WEBSITE_ICON = SOCIAL_BRAND.Website.icon
const WEBSITE_COLOR = SOCIAL_BRAND.Website.background
// No social-platform brand exists for "location" — a recognizable
// map-pin red, distinct from every platform color above.
const LOCATION_COLOR = "#EA4335"

/** Template 2 — premium corporate/business card. A single reusable
 * component with 3 switchable color variants (`profile.futureTheme`), same
 * approach as Template 1/LuxuryTemplate.tsx: same layout, same data, only
 * colors/gradients change. Deliberately does not render the shared
 * Services/Custom Fields/extra-social BodySections block — the reference
 * design this matches is a fixed, minimal 10-section layout with no room
 * for it. */

interface Template2ThemeConfig {
  pageBg: string
  coverFallback: string
  ink: string
  inkSoftClass: string
  border: string
  monogramBg: string
  monogramText: string
  ctaFrom: string
  ctaTo: string
  ctaTextClass: string
}

const TEMPLATE2_THEMES: Record<"green" | "blue" | "black", Template2ThemeConfig> = {
  green: {
    pageBg: "bg-[#F7F4EE]",
    coverFallback: "bg-gradient-to-br from-[#0F2345] to-[#1B3A5C]",
    ink: "#0F2345",
    inkSoftClass: "text-neutral-500",
    border: "#D8D3C8",
    monogramBg: "#0F2345",
    monogramText: "#F7F4EE",
    ctaFrom: "#0E6B4F",
    ctaTo: "#0B5A42",
    ctaTextClass: "text-white",
  },
  blue: {
    pageBg: "bg-gradient-to-b from-sky-50 to-blue-100",
    coverFallback: "bg-gradient-to-br from-[#1E3A5F] to-[#2563EB]",
    ink: "#1E3A5F",
    inkSoftClass: "text-blue-900/50",
    border: "#C7D9EC",
    monogramBg: "#1E3A5F",
    monogramText: "#EFF6FF",
    ctaFrom: "#2563EB",
    ctaTo: "#1D4ED8",
    ctaTextClass: "text-white",
  },
  black: {
    pageBg: "bg-gradient-to-b from-[#0B0F1A] to-[#151B27]",
    coverFallback: "bg-gradient-to-br from-[#1F2430] to-[#0B0F1A]",
    ink: "#F5F0E6",
    inkSoftClass: "text-white/50",
    border: "#333844",
    monogramBg: "#D4AF37",
    monogramText: "#151B27",
    ctaFrom: "#D4AF37",
    ctaTo: "#B8860B",
    ctaTextClass: "text-[#151B27]",
  },
}

// Not per-profile data — no natural field for either, and the reference
// gives fixed defaults for both. See the plan's scope note if these should
// become admin/customer-editable later.
const HEADER_TAGLINE = ["People", "Ideas", "Progress"]
const FOOTER_MESSAGE = "Let's Grow Together"

export default function Template2({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const theme = TEMPLATE2_THEMES[profile.futureTheme] ?? TEMPLATE2_THEMES.green
  const { enabledSocial, showPhone, showEmail } = useProfileSections(profile, showContactInfo)
  const companyLabel = profile.company || "VR's NEXORA"

  const contactActions = [
    showPhone && { key: "call", label: "Call", icon: Phone, color: CONTACT_ACTION_COLORS.call, href: `tel:${profile.phone}` },
    showPhone && {
      key: "whatsapp",
      label: "WhatsApp",
      icon: MessageCircle,
      color: CONTACT_ACTION_COLORS.whatsapp,
      href: `https://wa.me/${digitsOnly(profile.phone)}`,
      external: true,
    },
    showEmail && { key: "email", label: "Email", icon: Mail, color: CONTACT_ACTION_COLORS.email, href: `mailto:${profile.email}` },
  ].filter(Boolean) as Array<{ key: string; label: string; icon: typeof Phone; color: string; href: string; external?: boolean }>

  const socialActions = [
    ...enabledSocial.map((link) => ({
      key: link.platform,
      label: SOCIAL_BRAND[link.platform].label,
      icon: SOCIAL_BRAND[link.platform].icon,
      iconClassName: SOCIAL_BRAND[link.platform].iconClassName,
      color: SOCIAL_BRAND[link.platform].background,
      href: link.url,
    })),
    profile.website && { key: "website", label: "Website", icon: WEBSITE_ICON, color: WEBSITE_COLOR, href: profile.website },
    profile.googleMapsUrl && {
      key: "location",
      label: "Location",
      icon: MapPin,
      color: LOCATION_COLOR,
      href: profile.googleMapsUrl,
    },
  ].filter(Boolean) as Array<{
    key: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    iconClassName?: string
    color: string
    href: string
  }>

  return (
    <TemplateFrame onShare={onShare} bodyClassName={cn("max-h-[660px] overflow-y-auto", theme.pageBg)}>
      <div className="relative">
        <div className="h-28 w-full overflow-hidden">
          {profile.coverImage ? (
            <img src={profile.coverImage} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className={cn("h-full w-full", theme.coverFallback)} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-black/10" />

          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/15 text-sm font-bold text-white backdrop-blur-sm">
                {companyLabel.trim().charAt(0).toUpperCase()}
              </span>
              <span className="max-w-[110px] truncate text-sm font-bold text-white drop-shadow">{companyLabel}</span>
            </div>
            <div className="text-right text-[11px] font-medium leading-[1.4] text-white/80 drop-shadow">
              {HEADER_TAGLINE.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </div>

        {/* Positioned against this outer (non-clipping) wrapper, not the
            cover's own overflow-hidden box, and not via a negative margin
            either — both would get the bottom half clipped by the body's
            overflow-y-auto scroll boundary. Same fix as Template 1/Luxury. */}
        <img
          src={profile.avatar}
          alt={profile.fullName}
          className="absolute left-1/2 top-28 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white object-cover shadow-lg"
        />
      </div>

      <div className="px-6 pb-7 pt-14">
        <div className="text-center">
          <p className="text-xl font-bold" style={{ color: theme.ink }}>
            {profile.fullName}
          </p>
          {profile.designation && (
            <p className="mt-1 text-sm font-semibold" style={{ color: theme.ink }}>
              {profile.designation}
            </p>
          )}
          {profile.company && <p className={cn("text-sm", theme.inkSoftClass)}>{profile.company}</p>}
        </div>

        <div className="mt-4 border-t" style={{ borderColor: theme.border }} />

        {profile.bio && (
          <p className="mt-4 text-center text-sm italic leading-relaxed" style={{ color: theme.ink }}>
            &ldquo;{profile.bio}&rdquo;
          </p>
        )}

        <button
          type="button"
          onClick={() => downloadVCard(profile, showContactInfo)}
          className={cn(
            "mt-6 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold shadow-sm transition-transform hover:-translate-y-0.5",
            theme.ctaTextClass,
          )}
          style={{ background: `linear-gradient(90deg, ${theme.ctaFrom}, ${theme.ctaTo})` }}
        >
          <UserPlus className="size-4" />
          Save Contact
        </button>

        {contactActions.length > 0 && (
          <div
            className="mt-3 grid gap-2.5"
            style={{ gridTemplateColumns: `repeat(${contactActions.length}, minmax(0, 1fr))` }}
          >
            {contactActions.map((action) => {
              const Icon = action.icon
              return (
                <a
                  key={action.key}
                  href={action.href}
                  target={action.external ? "_blank" : undefined}
                  rel={action.external ? "noreferrer" : undefined}
                  className="flex flex-col items-center gap-1.5 rounded-full border px-2 py-3 text-xs font-semibold"
                  style={{ borderColor: theme.border, color: theme.ink }}
                >
                  <Icon className="size-4" style={{ color: action.color }} />
                  {action.label}
                </a>
              )
            })}
          </div>
        )}

        {socialActions.length > 0 && (
          <div className="mt-6 grid grid-cols-3 gap-x-4 gap-y-5">
            {socialActions.map((action) => {
              const Icon = action.icon
              return (
                <a
                  key={action.key}
                  href={action.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center gap-1.5 justify-self-center"
                >
                  <span
                    className="flex size-11 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105"
                    style={{ background: action.color }}
                  >
                    <Icon className={cn("size-4.5", action.iconClassName)} />
                  </span>
                  <span className={cn("text-[10px] font-medium", theme.inkSoftClass)}>{action.label}</span>
                </a>
              )
            })}
          </div>
        )}

        <button
          type="button"
          onClick={onShare}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border py-3 text-sm font-semibold"
          style={{ borderColor: theme.ink, color: theme.ink }}
        >
          <Share2 className="size-4" />
          Share Profile
        </button>

        <div className="mt-6 flex items-center justify-center gap-3">
          <span className="h-px flex-1" style={{ background: theme.border }} />
          <span className={cn("shrink-0 text-xs italic", theme.inkSoftClass)}>{FOOTER_MESSAGE}</span>
          <span className="h-px flex-1" style={{ background: theme.border }} />
        </div>
      </div>
    </TemplateFrame>
  )
}
