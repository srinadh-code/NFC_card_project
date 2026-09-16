import { Globe, Info, Mail, MessageCircle, Phone, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { BodySections } from "./BodySections"
import { digitsOnly, downloadVCard, SOCIAL_BRAND, TemplateFrame, type TemplateProps } from "./shared"

// Quick Actions use each action's real-world associated color (like the
// Social Links section already does per platform via SOCIAL_BRAND) instead
// of the theme accent — so Call/WhatsApp/Save/Email stay recognizable at a
// glance no matter which Luxury color variant is active.
const QUICK_ACTION_COLORS = {
  call: "#22C55E",
  whatsapp: SOCIAL_BRAND.WhatsApp.background,
  save: "#8B5CF6",
  email: "#EF4444",
} as const

/** Template 1 ("Luxury") — a single reusable component with 3 switchable
 * color variants (`profile.luxuryTheme`). Same layout, same data, only
 * colors/gradients/text change between variants — never a separate
 * template. Body sections (Social Links, Services, Contact, Custom
 * Fields/Links) are themed via BodySections' existing accent/labelColor/
 * chipShape/ctaColor props rather than re-implemented here. */

interface LuxuryThemeConfig {
  pageBg: string
  coverFallback: string
  heroTextPrimary: string
  heroTextSecondary: string
  accentText: string
  accent: string
  labelColor: string
  chipShape: "circle" | "rounded" | "square"
  ctaColor: string
  ctaTextClass: string
  dividerColor: string
}

const LUXURY_THEMES: Record<"green" | "blue" | "black", LuxuryThemeConfig> = {
  green: {
    pageBg: "bg-white",
    coverFallback: "bg-gradient-to-br from-emerald-500 to-emerald-700",
    heroTextPrimary: "text-neutral-900",
    heroTextSecondary: "text-neutral-500",
    accentText: "text-emerald-600",
    accent: "#059669",
    labelColor: "text-emerald-700/70",
    chipShape: "rounded",
    ctaColor: "#059669",
    ctaTextClass: "text-white",
    dividerColor: "border-emerald-100",
  },
  blue: {
    pageBg: "bg-gradient-to-b from-sky-50 to-blue-100",
    coverFallback: "bg-gradient-to-br from-blue-500 to-sky-600",
    heroTextPrimary: "text-slate-900",
    heroTextSecondary: "text-slate-500",
    accentText: "text-blue-600",
    accent: "#2563EB",
    labelColor: "text-blue-700/70",
    chipShape: "circle",
    ctaColor: "#2563EB",
    ctaTextClass: "text-white",
    dividerColor: "border-blue-100",
  },
  black: {
    pageBg: "bg-gradient-to-b from-[#0B0B0F] to-[#151515]",
    coverFallback: "bg-gradient-to-br from-[#1a1a1a] to-[#0B0B0F]",
    heroTextPrimary: "text-white",
    heroTextSecondary: "text-white/50",
    accentText: "text-[#FBBF24]",
    accent: "#FBBF24",
    labelColor: "text-white/40",
    chipShape: "square",
    ctaColor: "#FBBF24",
    ctaTextClass: "text-[#151515]",
    dividerColor: "border-white/10",
  },
}

export default function LuxuryTemplate({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const theme = LUXURY_THEMES[profile.luxuryTheme] ?? LUXURY_THEMES.black
  const showPhone = showContactInfo && Boolean(profile.phone)
  const showEmail = showContactInfo && Boolean(profile.email)

  const quickActions = [
    showPhone && {
      key: "call",
      label: "Call",
      icon: Phone,
      color: QUICK_ACTION_COLORS.call,
      href: `tel:${profile.phone}`,
    },
    showPhone && {
      key: "whatsapp",
      label: "WhatsApp",
      icon: MessageCircle,
      color: QUICK_ACTION_COLORS.whatsapp,
      href: `https://wa.me/${digitsOnly(profile.phone)}`,
      external: true,
    },
    {
      key: "save",
      label: "Save",
      icon: UserPlus,
      color: QUICK_ACTION_COLORS.save,
      onClick: () => downloadVCard(profile, showContactInfo),
    },
    showEmail && {
      key: "email",
      label: "Email",
      icon: Mail,
      color: QUICK_ACTION_COLORS.email,
      href: `mailto:${profile.email}`,
    },
  ].filter(Boolean) as Array<{
    key: string
    label: string
    icon: typeof Phone
    color: string
    href?: string
    external?: boolean
    onClick?: () => void
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
          {profile.company && (
            <span className="absolute left-4 top-4 max-w-[70%] truncate text-xs font-semibold uppercase tracking-wide text-white drop-shadow">
              {profile.company}
            </span>
          )}
        </div>

        {/* Positioned against this outer (non-clipping) wrapper, not the
            cover's own overflow-hidden box, so the bottom half isn't cut off
            — and not via a negative margin either, which would get clipped
            by the body's overflow-y-auto scroll boundary above y=0. */}
        <img
          src={profile.avatar}
          alt={profile.fullName}
          className="absolute left-1/2 top-28 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white object-cover shadow-lg"
        />
      </div>

      <div className="px-6 pb-8">
        <div className="pt-12 text-center">
          <p className={cn("text-xl font-bold", theme.heroTextPrimary)}>{profile.fullName}</p>
          {profile.designation && (
            <p className={cn("mt-1 text-xs font-semibold uppercase tracking-wide", theme.accentText)}>{profile.designation}</p>
          )}
          {profile.company && <p className={cn("mt-0.5 text-xs", theme.heroTextSecondary)}>{profile.company}</p>}
        </div>

        {quickActions.length > 0 && (
          <div className="mt-6 flex flex-nowrap items-start justify-center gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon
              const content = (
                <>
                  <span
                    className="flex size-10 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105"
                    style={{ background: action.color }}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className={cn("truncate text-[9.5px] font-medium", theme.heroTextSecondary)}>{action.label}</span>
                </>
              )
              return action.href ? (
                <a
                  key={action.key}
                  href={action.href}
                  target={action.external ? "_blank" : undefined}
                  rel={action.external ? "noreferrer" : undefined}
                  className="flex w-12 shrink-0 flex-col items-center gap-1.5"
                >
                  {content}
                </a>
              ) : (
                <button key={action.key} type="button" onClick={action.onClick} className="flex w-12 shrink-0 flex-col items-center gap-1.5">
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
              "mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition-transform hover:-translate-y-0.5",
              theme.ctaTextClass,
            )}
            style={{ background: theme.ctaColor }}
          >
            <Globe className="size-4" />
            Visit Website
          </a>
        )}

        {profile.bio && (
          <div className={cn("mt-7 w-full border-t pt-6", theme.dividerColor)}>
            <p className={cn("mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide", theme.labelColor)}>
              <Info className="size-3.5" style={{ color: theme.accent }} />
              About
            </p>
            <p className={cn("text-left text-sm leading-relaxed", theme.heroTextSecondary)}>{profile.bio}</p>
          </div>
        )}

        <BodySections
          profile={profile}
          showContactInfo={showContactInfo}
          accent={theme.accent}
          labelColor={theme.labelColor}
          chipShape={theme.chipShape}
          ctaColor={theme.ctaColor}
        />
      </div>
    </TemplateFrame>
  )
}
