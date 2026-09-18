import { ArrowRight, Globe, Link2, Mail, MessageCircle, Phone, User, UserPlus, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CustomField } from "@/types"
import { digitsOnly, downloadVCard, SOCIAL_BRAND, TemplateFrame, useProfileSections, type TemplateProps } from "./shared"

/** Nature — premium white + soft-green corporate business card. Clean,
 * minimal, no dark banners/glass — a white main content area with a couple
 * of soft green blurred accent shapes, dark green (#1B5E20) as the single
 * accent color throughout. Deliberately does not render the shared
 * BodySections block — this design has its own fixed section set.
 * Tagline is sourced from a CustomField by label match, same approach as
 * every other template in this set. */

const DARK_GREEN = "#1B5E20"
const ACCENT_GREEN = "#2E7D32"

// Not per-profile data — decorative brand copy fixed for every card, same
// treatment every other template in this set uses.
const HEADER_SUBTITLE = "Digital Identity"
const FOOTER_MESSAGE = "CONNECT • COLLABORATE • CREATE"

function findCustomFieldValue(fields: CustomField[], label: string): string | undefined {
  const match = fields.find((f) => f.label.trim().toLowerCase() === label.toLowerCase())
  return match?.value.trim() || undefined
}

export default function NatureTemplate({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const { enabledSocial, showPhone, showEmail } = useProfileSections(profile, showContactInfo)
  const companyLabel = profile.company || "VR's NEXORA"
  const tagline = findCustomFieldValue(profile.customFields, "Tagline")

  const quickActions = [
    showPhone && { key: "call", label: "Call", icon: Phone, color: DARK_GREEN, bg: "#E8F5E9", href: `tel:${profile.phone}` },
    {
      key: "save",
      label: "Save",
      icon: UserPlus,
      color: "#1D4ED8",
      bg: "#E3F2FD",
      onClick: () => downloadVCard(profile, showContactInfo),
    },
    showPhone && {
      key: "whatsapp",
      label: "WhatsApp",
      icon: MessageCircle,
      color: SOCIAL_BRAND.WhatsApp.background,
      bg: "#E8F5E9",
      href: `https://wa.me/${digitsOnly(profile.phone)}`,
      external: true,
    },
    showEmail && { key: "email", label: "Email", icon: Mail, color: "#DC2626", bg: "#FCE4EC", href: `mailto:${profile.email}` },
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

  return (
    <TemplateFrame onShare={onShare} bodyClassName="relative max-h-[660px] overflow-y-auto bg-white">
      {/* Soft green geometric/leaf-inspired accents — subtle, translucent,
          confined to the corners so the main content area reads as clean
          white, per the "no dark mode, no glassmorphism" requirement. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-10 -top-12 size-44 bg-[#A5D6A7]/35 blur-[10px]"
          style={{ borderRadius: "38% 62% 63% 37% / 41% 44% 56% 59%" }}
        />
        <div className="absolute -right-12 top-28 size-36 rounded-full bg-[#C8E6C9]/50 blur-[35px]" />
        <div className="absolute -bottom-14 -right-10 size-40 rounded-full bg-[#81C784]/25 blur-[45px]" />
      </div>

      <div className="relative px-6 pb-7 pt-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow-primary">
            <Zap className="size-5" fill="currentColor" />
          </span>
          <div className="min-w-0">
            <p className="max-w-[180px] truncate text-sm font-bold uppercase tracking-wide" style={{ color: DARK_GREEN }}>
              {companyLabel}
            </p>
            <p className="text-[10px] text-neutral-500">{HEADER_SUBTITLE}</p>
          </div>
        </div>

        <div className="mt-3 flex justify-center">
          <img
            src={profile.avatar}
            alt={profile.fullName}
            className="size-28 rounded-full border-4 border-white object-cover shadow-lg"
          />
        </div>

        <div className="mt-4 text-center">
          <p className="text-xl font-bold text-neutral-900">{profile.fullName}</p>
          {profile.designation && (
            <p className="mt-1 text-sm font-bold" style={{ color: ACCENT_GREEN }}>
              {profile.designation}
            </p>
          )}
          {profile.company && <p className="text-sm text-neutral-500">{profile.company}</p>}
          {tagline && <p className="mt-2 text-sm italic text-neutral-500">&ldquo;{tagline}&rdquo;</p>}
        </div>

        {quickActions.length > 0 && (
          <div className="mt-6 grid grid-cols-4 gap-2.5">
            {quickActions.map((action) => {
              const Icon = action.icon
              const content = (
                <>
                  <Icon className="size-5" style={{ color: action.color }} />
                  <span className="text-center text-[10px] font-semibold leading-tight text-neutral-700">{action.label}</span>
                </>
              )
              const cardClass = "flex flex-col items-center justify-center gap-1 rounded-lg py-3 shadow-sm transition-transform hover:-translate-y-0.5"
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
                <button key={action.key} type="button" onClick={action.onClick} className={cardClass} style={{ background: action.bg }}>
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
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5"
            style={{ background: `linear-gradient(90deg, ${DARK_GREEN}, ${ACCENT_GREEN})` }}
          >
            <Globe className="size-4" />
            Visit Website
            <ArrowRight className="size-4" />
          </a>
        )}

        {profile.bio && (
          <div className="mt-5 rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: DARK_GREEN }}>
              <User className="size-3.5" style={{ color: DARK_GREEN }} />
              About
            </p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">{profile.bio}</p>
            <div className="mt-3 h-px bg-neutral-100" />
          </div>
        )}

        {enabledSocial.length > 0 && (
          <div className="mt-5">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: DARK_GREEN }}>
              <Link2 className="size-3.5" style={{ color: DARK_GREEN }} />
              Social Links
            </p>
            <div className="mt-4 grid grid-cols-5 gap-2">
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
                    <span
                      className="flex size-10 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105"
                      style={{ background: brand.background }}
                    >
                      <Icon className={cn("size-4", brand.iconClassName)} />
                    </span>
                    <span className="truncate text-[9px] font-medium text-neutral-500">{brand.label}</span>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-7 flex items-center justify-center gap-3">
          <span className="h-px flex-1 bg-neutral-200" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{FOOTER_MESSAGE}</span>
          <span className="h-px flex-1 bg-neutral-200" />
        </div>
      </div>
    </TemplateFrame>
  )
}
