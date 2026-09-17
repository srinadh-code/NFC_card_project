import {
  Briefcase,
  ChevronRight,
  Download,
  GraduationCap,
  Info,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  User,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SOCIAL_BRAND, digitsOnly, downloadVCard, TemplateFrame, useProfileSections, type TemplateProps } from "./shared"

// Template 4 ("Glass") — a premium frosted-glass digital-identity card:
// translucent white surfaces over a blurred atmospheric backdrop, dark
// navy/slate text (not the white-on-dark look most other templates use).
// Deliberately does NOT include the generic BodySections bundle every other
// template shares (Services / address-contact rows / Custom Links) — the
// reference design this was built from has its own bespoke section set
// (info strip, About Me, Find Me On, Download vCard), so reusing that
// component would add sections the design never shows. It still reuses
// BodySections' underlying *data* hook (`useProfileSections`) and the same
// `SOCIAL_BRAND`/`downloadVCard`/`digitsOnly` helpers every other template
// uses, so there's no second copy of that filtering/vCard/WhatsApp logic.

// Presentational heuristic only (same idea as shared.tsx's
// getCustomLinkVisual for custom links) — a custom field has no stored
// "type", so its icon in the info strip is inferred from its label text.
function inferStripIcon(label: string): LucideIcon {
  const l = label.toLowerCase()
  if (l.includes("exp")) return Briefcase
  if (l.includes("edu") || l.includes("degree") || l.includes("qualif")) return GraduationCap
  if (l.includes("avail") || l.includes("open")) return Send
  return Info
}

const GRID_COLS_BY_COUNT: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
}

export default function GlassTemplate({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const { enabledSocial, customFields, showPhone, showEmail } = useProfileSections(profile, showContactInfo)

  const initials = profile.fullName
    ? profile.fullName
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U"

  // LinkedIn gets its own dedicated quick-action button below (matching the
  // reference), so it's excluded from the "Find Me On" row to avoid showing
  // the same real link twice.
  const linkedIn = enabledSocial.find((l) => l.platform === "LinkedIn")
  const findMeOnSocial = enabledSocial.filter((l) => l.platform !== "LinkedIn")

  const contactActions = [
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
  ].filter(Boolean) as Array<{ key: string; label: string; icon: LucideIcon; href: string; external?: boolean }>

  // Real data only: city/state for Location, then up to 3 of the customer's
  // own custom fields (whatever they've actually configured — never the
  // reference's example "2+ Years Exp." / "MCS" / "Open to Opportunities"
  // values) — capped at 4 columns total to match the reference's strip.
  const stripItems: Array<{ icon: LucideIcon; primary: string; secondary?: string }> = []
  const location = [profile.city, profile.state].filter(Boolean)
  if (location.length > 0) stripItems.push({ icon: MapPin, primary: location[0], secondary: location[1] })
  for (const field of customFields) {
    if (stripItems.length >= 4) break
    if (!field.value?.trim()) continue
    stripItems.push({ icon: inferStripIcon(field.label), primary: field.value, secondary: field.label || undefined })
  }

  return (
    <TemplateFrame onShare={onShare} bodyClassName="relative max-h-[660px] overflow-y-auto bg-[#7C8FB8]">
      {/* Atmospheric backdrop — the customer's own cover photo, heavily
          blurred, standing in for the reference's blurred mountain/lake
          scene; a soft gradient fills in when no cover photo is set rather
          than inventing a stock photo. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {profile.coverImage ? (
          <img src={profile.coverImage} alt="" className="size-full scale-125 object-cover blur-2xl" />
        ) : (
          <div className="size-full bg-gradient-to-br from-[#8B9DC3] via-[#A79FC9] to-[#D8A98F]" />
        )}
        <div className="absolute inset-0 bg-white/15" />
      </div>

      <div className="relative px-5 pb-7 pt-5">
        {/* Top identity row — the share button itself is TemplateFrame's
            existing one (absolute, top-right of the whole card), so this
            row only occupies the left side and leaves room for it. */}
        <div className="flex items-center gap-3 pr-12">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/40 text-sm font-bold text-slate-800 backdrop-blur-md">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">{profile.fullName}</p>
            <p className="text-xs text-slate-600">Digital Identity</p>
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <img
            src={profile.avatar}
            alt={profile.fullName}
            className="size-28 rounded-full border-[3px] border-white/70 object-cover shadow-[0_8px_30px_rgba(15,23,42,0.25)] backdrop-blur-md"
          />
        </div>

        <div className="mt-4 text-center">
          <p className="text-xl font-bold text-slate-900">{profile.fullName}</p>
          {profile.designation && <p className="mt-0.5 text-sm text-slate-600">{profile.designation}</p>}
          <div className="mx-auto mt-3 h-px w-8 bg-slate-400/50" />
          {profile.bio && (
            <p className="mt-3 text-sm italic text-slate-600">&ldquo;{profile.bio}&rdquo;</p>
          )}
        </div>

        {contactActions.length > 0 && (
          <div className={cn("mt-6 grid gap-2.5", GRID_COLS_BY_COUNT[contactActions.length] ?? "grid-cols-4")}>
            {contactActions.map((action) => {
              const Icon = action.icon
              return (
                <a
                  key={action.key}
                  href={action.href}
                  target={action.external ? "_blank" : undefined}
                  rel={action.external ? "noreferrer" : undefined}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/60 bg-white/40 py-3 text-slate-800 backdrop-blur-md transition-transform hover:-translate-y-0.5"
                >
                  <Icon className="size-5" />
                  <span className="text-[10.5px] font-semibold">{action.label}</span>
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
            className="mt-4 flex w-full items-center justify-between gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5"
          >
            <span className="flex items-center gap-2">
              <span className="text-base leading-none">🌐</span> Visit Website
            </span>
            <ChevronRight className="size-4" />
          </a>
        )}

        {stripItems.length > 0 && (
          <div
            className={cn(
              "mt-4 grid divide-x divide-white/40 rounded-2xl border border-white/60 bg-white/40 py-3.5 text-center backdrop-blur-md",
              GRID_COLS_BY_COUNT[stripItems.length] ?? "grid-cols-4",
            )}
          >
            {stripItems.map((item, i) => {
              const Icon = item.icon
              return (
                <div key={i} className="flex flex-col items-center gap-1 px-1">
                  <Icon className="size-4 text-slate-700" />
                  <p className="truncate text-xs font-bold text-slate-900">{item.primary}</p>
                  {item.secondary && <p className="truncate text-[10px] text-slate-600">{item.secondary}</p>}
                </div>
              )
            })}
          </div>
        )}

        {profile.bio && (
          <div className="mt-4 rounded-2xl border border-white/60 bg-white/40 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-900">
              <span className="flex items-center gap-2 text-sm font-bold">
                <User className="size-4" /> About Me
              </span>
              <ChevronRight className="size-4 text-slate-500" />
            </div>
            <p className="mt-2 text-left text-xs leading-relaxed text-slate-700">{profile.bio}</p>
          </div>
        )}

        {findMeOnSocial.length > 0 && (
          <div className="mt-4 rounded-2xl border border-white/60 bg-white/40 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-900">
              <span className="flex items-center gap-2 text-sm font-bold">
                <Link2 className="size-4" /> Find Me On
              </span>
              <ChevronRight className="size-4 text-slate-500" />
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-4">
              {findMeOnSocial.map((link) => {
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
                      className="flex size-10 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105"
                      style={{ background: brand.background }}
                    >
                      <Icon className={cn("size-4.5", brand.iconClassName)} />
                    </span>
                    <span className="text-[9.5px] font-medium text-slate-600">{brand.label}</span>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => downloadVCard(profile, showContactInfo)}
          className="mt-4 flex w-full items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/40 px-5 py-3.5 text-sm font-semibold text-slate-800 backdrop-blur-md transition-transform hover:-translate-y-0.5"
        >
          <span className="flex items-center gap-2">
            <Download className="size-4" /> Download vCard
          </span>
          <ChevronRight className="size-4" />
        </button>

        <div className="mt-6 flex items-center justify-center gap-3 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          <span className="h-px w-8 bg-slate-400/40" />
          Connect &bull; Collaborate &bull; Create
          <span className="h-px w-8 bg-slate-400/40" />
        </div>
      </div>
    </TemplateFrame>
  )
}
