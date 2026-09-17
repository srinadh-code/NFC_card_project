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
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { CustomField } from "@/types"
import { digitsOnly, downloadVCard, SOCIAL_BRAND, TemplateFrame, useProfileSections, type TemplateProps } from "./shared"

/** Glass — premium glassmorphism business card (Apple VisionOS-style
 * frosted glass, not "solid tinted cards"). A single reusable component
 * with 3 switchable color themes (`profile.glassTheme`), same approach as
 * Template 1/LuxuryTemplate.tsx and Template 2/Template2.tsx. Every panel
 * is genuinely translucent — a busy, multi-blob blurred backdrop shows
 * through, plus each panel gets its own reflection sheen (`GlassSheen`)
 * and a layered shadow (soft outer + a crisp inset top highlight), which
 * is what actually sells "real glass" rather than opacity/blur numbers
 * alone. Deliberately does not render the shared BodySections block
 * (Services/extra Custom Fields/Custom Links) — this design has its own
 * fixed section set. Experience/Education/Availability/Tagline are sourced
 * from CustomField by label match rather than new dedicated Profile
 * fields, same approach as Impact. */

interface GlassThemeConfig {
  bodyBg: string
  blobColors: string[]
  panelClass: string
  panelShadow: string
  textClass: string
  textSoftClass: string
  textMutedClass: string
  iconClass: string
  dividerClass: string
  statDividerColor: string
  // The primary CTA ("Visit Website") is a solid pill, not glass — a
  // deliberate contrast against every other translucent panel.
  ctaSolidBg: string
  ctaTextClass: string
}

// Layered box-shadow every glass panel shares: a soft outer drop shadow for
// depth/floating, plus a 1px inset highlight along the top edge — the
// classic "light catching the rim of the glass" cue real frosted-glass UIs
// (iOS/VisionOS) always have and flat translucent cards never do.
function glassShadow(tint: string) {
  return `0 8px 32px -8px ${tint}, inset 0 1px 0 rgba(255,255,255,0.35), inset 0 0 0 1px rgba(255,255,255,0.06)`
}

const GLASS_THEMES: Record<"white" | "blue" | "green", GlassThemeConfig> = {
  blue: {
    bodyBg: "bg-gradient-to-br from-[#2B3A6B] via-[#5B4B8A] to-[#1F2A52]",
    blobColors: ["#F472B6", "#60A5FA", "#A78BFA", "#34D399", "#FBBF24", "#818CF8"],
    panelClass: "rounded-2xl border border-white/25 bg-white/[0.08] backdrop-blur-2xl",
    panelShadow: glassShadow("rgba(0,0,0,0.35)"),
    textClass: "text-white",
    textSoftClass: "text-white/75",
    textMutedClass: "text-white/55",
    iconClass: "text-white",
    dividerClass: "bg-white/25",
    statDividerColor: "rgba(255,255,255,0.2)",
    ctaSolidBg: "#1F2A52",
    ctaTextClass: "text-white",
  },
  green: {
    bodyBg: "bg-gradient-to-br from-[#0B3634] via-[#146356] to-[#092623]",
    blobColors: ["#34D399", "#5EEAD4", "#A7F3D0", "#60A5FA", "#FBBF24", "#4ADE80"],
    panelClass: "rounded-2xl border border-white/25 bg-white/[0.08] backdrop-blur-2xl",
    panelShadow: glassShadow("rgba(0,0,0,0.35)"),
    textClass: "text-white",
    textSoftClass: "text-white/75",
    textMutedClass: "text-white/55",
    iconClass: "text-white",
    dividerClass: "bg-white/25",
    statDividerColor: "rgba(255,255,255,0.2)",
    ctaSolidBg: "#092623",
    ctaTextClass: "text-white",
  },
  white: {
    // A calm, mostly monochrome blue-gray backdrop (per the reference) —
    // subtle depth, not a rainbow of colors bleeding through.
    bodyBg: "bg-gradient-to-br from-[#DCE3F0] via-[#E8ECF3] to-[#F3F0EE]",
    blobColors: ["#C7D2FE", "#BFDBFE", "#DBEAFE", "#E0E7FF", "#CBD5E1", "#BFDBFE"],
    panelClass: "rounded-2xl border border-white/70 bg-white/45 backdrop-blur-2xl",
    panelShadow: glassShadow("rgba(15,23,42,0.12)"),
    textClass: "text-slate-900",
    textSoftClass: "text-slate-600",
    textMutedClass: "text-slate-400",
    iconClass: "text-slate-900",
    dividerClass: "bg-slate-300",
    statDividerColor: "rgba(15,23,42,0.12)",
    ctaSolidBg: "#0F172A",
    ctaTextClass: "text-white",
  },
}

// Not per-profile data — decorative brand copy fixed for every card.
const HEADER_SUBTITLE = "Digital Identity"
const FOOTER_MESSAGE = "CONNECT • COLLABORATE • CREATE"
const TEXT_SHADOW = "0 1px 6px rgba(0,0,0,0.25)"

function findCustomFieldValue(fields: CustomField[], label: string): string | undefined {
  const match = fields.find((f) => f.label.trim().toLowerCase() === label.toLowerCase())
  return match?.value.trim() || undefined
}

/** The reflection/sheen every glass panel needs: a soft diagonal highlight
 * from the top-left, on top of a crisp bright line along the top edge —
 * without this, translucency + blur alone still just reads as a flat
 * tinted card. Render as the first child of any `relative overflow-hidden`
 * container. */
function GlassSheen() {
  return (
    <>
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/30 via-white/5 to-transparent" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/50" />
    </>
  )
}

function SectionHeading({
  icon: Icon,
  title,
  textClass,
  iconClass,
  mutedClass,
}: {
  icon: typeof User
  title: string
  textClass: string
  iconClass: string
  mutedClass: string
}) {
  return (
    <div className="relative flex items-center justify-between">
      <span className={cn("flex items-center gap-2 text-sm font-bold", textClass)} style={{ textShadow: TEXT_SHADOW }}>
        <Icon className={cn("size-4", iconClass)} />
        {title}
      </span>
      <ChevronRight className={cn("size-4", mutedClass)} />
    </div>
  )
}

export default function GlassTemplate({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const theme = GLASS_THEMES[profile.glassTheme] ?? GLASS_THEMES.blue
  const { enabledSocial, showPhone, showEmail } = useProfileSections(profile, showContactInfo)
  const companyLabel = profile.company || "VR's NEXORA"
  const linkedIn = enabledSocial.find((l) => l.platform === "LinkedIn")

  const tagline = findCustomFieldValue(profile.customFields, "Tagline")
  const experience = findCustomFieldValue(profile.customFields, "Experience")
  const education = findCustomFieldValue(profile.customFields, "Education")
  const availability = findCustomFieldValue(profile.customFields, "Availability")
  const location = [profile.city, profile.state].filter(Boolean).join(", ") || undefined

  const quickActions = [
    showPhone && { key: "call", label: "Call", icon: Phone, href: `tel:${profile.phone}` },
    showEmail && { key: "email", label: "Email", icon: Mail, href: `mailto:${profile.email}` },
    showPhone && {
      key: "whatsapp",
      label: "WhatsApp",
      icon: MessageCircle,
      href: `https://wa.me/${digitsOnly(profile.phone)}`,
      external: true,
    },
    linkedIn && { key: "linkedin", label: "LinkedIn", icon: SOCIAL_BRAND.LinkedIn.icon, href: linkedIn.url, external: true },
  ].filter(Boolean) as Array<{
    key: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    href: string
    external?: boolean
  }>

  const stats = [
    experience && { key: "experience", icon: Briefcase, label: "Experience", value: experience },
    education && { key: "education", icon: GraduationCap, label: "Education", value: education },
    location && { key: "location", icon: MapPin, label: "Location", value: location },
    availability && { key: "availability", icon: Send, label: "Availability", value: availability },
  ].filter(Boolean) as Array<{ key: string; icon: typeof Briefcase; label: string; value: string }>

  return (
    <TemplateFrame onShare={onShare} bodyClassName={cn("relative max-h-[660px] overflow-y-auto", theme.bodyBg)}>
      {/* A busy, multi-color blurred "bokeh" field — this is what actually
          shows through the glass panels below. A flat gradient alone blurs
          into just another flat shade, which is why a plain tinted panel
          over it used to read as "solid", not "glass". */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-14 top-4 size-48 rounded-full opacity-40 blur-[60px]" style={{ background: theme.blobColors[0] }} />
        <div className="absolute -right-10 top-24 size-44 rounded-full opacity-35 blur-[55px]" style={{ background: theme.blobColors[1] }} />
        <div className="absolute left-4 top-64 size-56 rounded-full opacity-30 blur-[70px]" style={{ background: theme.blobColors[2] }} />
        <div className="absolute -right-16 bottom-56 size-52 rounded-full opacity-30 blur-[65px]" style={{ background: theme.blobColors[3] }} />
        <div className="absolute -bottom-20 left-10 size-60 rounded-full opacity-35 blur-[75px]" style={{ background: theme.blobColors[4] }} />
        <div className="absolute bottom-10 right-0 size-40 rounded-full opacity-25 blur-[55px]" style={{ background: theme.blobColors[5] }} />
      </div>

      <div className="relative px-5 pb-7 pt-5">
        {/* Minimal header — no card/container, just the mark and text
            sitting directly on the backdrop. */}
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-white shadow-glow-primary">
            <Zap className="size-4" fill="currentColor" />
          </span>
          <div className="min-w-0">
            <p className={cn("max-w-[170px] truncate text-sm font-bold leading-tight", theme.textClass)} style={{ textShadow: TEXT_SHADOW }}>
              {companyLabel}
            </p>
            <p className={cn("text-[10px] leading-tight", theme.textMutedClass)}>{HEADER_SUBTITLE}</p>
          </div>
        </div>

        {/* Profile photo sits high, overlapping the header band, with no
            border/ring/glow — a clean portrait blended into the backdrop. */}
        <div className="-mt-2 flex justify-center">
          <img src={profile.avatar} alt={profile.fullName} className="size-32 rounded-full object-cover shadow-md" />
        </div>

        <div className="mt-3 text-center">
          <p className={cn("text-xl font-bold", theme.textClass)} style={{ textShadow: TEXT_SHADOW }}>
            {profile.fullName}
          </p>
          {(profile.designation || profile.company) && (
            <p className={cn("mt-0.5 text-sm", theme.textSoftClass)}>
              {[profile.designation, profile.company].filter(Boolean).join(" · ")}
            </p>
          )}
          {tagline && <p className={cn("mt-1.5 text-sm italic", theme.textMutedClass)}>&ldquo;{tagline}&rdquo;</p>}
        </div>

        {quickActions.length > 0 && (
          <div className="mt-6 grid gap-2.5" style={{ gridTemplateColumns: `repeat(${quickActions.length}, minmax(0, 1fr))` }}>
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <a
                  key={action.key}
                  href={action.href}
                  target={action.external ? "_blank" : undefined}
                  rel={action.external ? "noreferrer" : undefined}
                  className={cn("relative flex flex-col items-center gap-2 overflow-hidden py-3.5 transition-transform hover:-translate-y-0.5", theme.panelClass)}
                  style={{ boxShadow: theme.panelShadow }}
                >
                  <GlassSheen />
                  <Icon className={cn("relative size-6", theme.iconClass)} />
                  <span className={cn("relative text-center text-[11px] font-bold leading-tight", theme.textClass)}>
                    {action.label}
                  </span>
                </a>
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
              "relative mt-4 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl px-4 py-3.5 text-sm font-bold transition-transform hover:-translate-y-0.5",
              theme.ctaTextClass,
            )}
            style={{
              background: theme.ctaSolidBg,
              boxShadow: "0 10px 26px -8px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
          >
            {/* A solid pill, not glass — deliberate contrast against every
                translucent panel above/below it, per the reference. */}
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
            <Globe className="relative size-4" />
            <span className="relative">Visit Website</span>
            <ArrowRight className="relative size-4" />
          </a>
        )}

        {enabledSocial.length > 0 && (
          <div className={cn("relative mt-5 overflow-hidden p-4", theme.panelClass)} style={{ boxShadow: theme.panelShadow }}>
            <GlassSheen />
            <SectionHeading
              icon={Link2}
              title="Find Me On"
              textClass={theme.textClass}
              iconClass={theme.iconClass}
              mutedClass={theme.textMutedClass}
            />
            <div className="relative mt-4 grid grid-cols-3 gap-x-4 gap-y-5">
              {enabledSocial.map((link) => {
                const brand = SOCIAL_BRAND[link.platform]
                const Icon = brand.icon
                return (
                  <a
                    key={link.platform}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-col items-center gap-1.5 justify-self-center"
                    title={brand.label}
                  >
                    {/* Real per-platform brand color (same source Template
                        1/2 use) rendered as a glass circle — a translucent
                        highlight sweep + blur + ring keep it distinct from
                        Template 1/2's flat chips and Impact's squircles. */}
                    <span
                      className="relative flex size-11 items-center justify-center overflow-hidden rounded-full text-white ring-1 ring-white/40 backdrop-blur-md transition-transform hover:scale-105"
                      style={{ background: brand.background, boxShadow: "0 6px 16px -6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)" }}
                    >
                      <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/35 via-white/5 to-transparent" />
                      <Icon className={cn("relative size-4.5", brand.iconClassName)} />
                    </span>
                    <span className={cn("text-[10px] font-medium", theme.textSoftClass)}>{brand.label}</span>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        {profile.bio && (
          <div className={cn("relative mt-5 overflow-hidden p-4", theme.panelClass)} style={{ boxShadow: theme.panelShadow }}>
            <GlassSheen />
            <SectionHeading
              icon={User}
              title="About Me"
              textClass={theme.textClass}
              iconClass={theme.iconClass}
              mutedClass={theme.textMutedClass}
            />
            <p className={cn("relative mt-2 text-sm leading-relaxed", theme.textSoftClass)}>{profile.bio}</p>
          </div>
        )}

        {stats.length > 0 && (
          <div
            className={cn("relative mt-5 grid overflow-hidden py-4", theme.panelClass)}
            style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, boxShadow: theme.panelShadow }}
          >
            <GlassSheen />
            {stats.map((stat, i) => {
              const Icon = stat.icon
              const isLocation = stat.key === "location"
              return (
                <div
                  key={stat.key}
                  className="relative flex flex-col items-center gap-1.5 px-2 text-center"
                  style={i > 0 ? { borderLeft: `1px solid ${theme.statDividerColor}` } : undefined}
                >
                  {isLocation ? (
                    // A recognizable red map-pin badge — makes Location pop
                    // out from the other, plain monochrome stat icons.
                    <span
                      className="flex size-7 items-center justify-center rounded-full text-white shadow-sm"
                      style={{ background: "#EA4335", boxShadow: "0 4px 10px -3px rgba(234,67,53,0.6)" }}
                    >
                      <Icon className="size-3.5" fill="currentColor" />
                    </span>
                  ) : (
                    <Icon className={cn("size-4", theme.iconClass)} />
                  )}
                  <span className={cn("text-xs font-bold", theme.textClass)}>{stat.value}</span>
                  <span className={cn("text-[9px] uppercase tracking-wide", theme.textMutedClass)}>{stat.label}</span>
                </div>
              )
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => downloadVCard(profile, showContactInfo)}
          className={cn(
            "relative mt-6 flex w-full items-center justify-center gap-2 overflow-hidden py-3.5 text-sm font-bold transition-transform hover:-translate-y-0.5",
            theme.textClass,
            theme.panelClass,
          )}
          style={{ boxShadow: theme.panelShadow, textShadow: TEXT_SHADOW }}
        >
          <GlassSheen />
          <Download className="relative size-4" />
          <span className="relative">Download vCard</span>
          <ArrowRight className="relative size-4" />
        </button>

        <div className="mt-6 flex items-center justify-center gap-3">
          <span className={cn("h-px flex-1", theme.dividerClass)} />
          <span className={cn("shrink-0 text-[10px] font-semibold uppercase tracking-wide", theme.textSoftClass)}>{FOOTER_MESSAGE}</span>
          <span className={cn("h-px flex-1", theme.dividerClass)} />
        </div>
      </div>
    </TemplateFrame>
  )
}
