import { Globe, Mail, MessageCircle, Phone, UserPlus } from "lucide-react"
import { BodySections } from "./BodySections"
import { digitsOnly, downloadVCard, TemplateFrame, type TemplateProps } from "./shared"

const ACCENT = "#A78BFA"

/** Glass — two separate floating frosted panels (an icon-chip strip
 * overlapping top-right, then a name/CTA card overlapping the avatar below)
 * rather than one continuous column of content, distinguishing it from
 * Creative's single glowing column. */
export default function GlassTemplate({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const showPhone = showContactInfo && Boolean(profile.phone)
  const showEmail = showContactInfo && Boolean(profile.email)

  return (
    <TemplateFrame onShare={onShare} bodyClassName="relative max-h-[660px] overflow-y-auto bg-gradient-to-br from-[#1E293B] via-[#334155] to-[#0F172A]">
      <div className="pointer-events-none absolute left-6 top-16 size-32 rounded-full bg-[#38BDF8]/30 blur-[50px]" />
      <div className="pointer-events-none absolute right-4 top-36 size-28 rounded-full bg-[#A78BFA]/30 blur-[45px]" />

      <div className="absolute right-4 top-14 z-[1] flex gap-2 rounded-2xl border border-white/20 bg-white/10 p-2 backdrop-blur-md">
        {showPhone && (
          <a href={`tel:${profile.phone}`} className="flex size-8 items-center justify-center rounded-lg text-white">
            <Phone className="size-3.5" />
          </a>
        )}
        {showPhone && (
          <a href={`https://wa.me/${digitsOnly(profile.phone)}`} target="_blank" rel="noreferrer" className="flex size-8 items-center justify-center rounded-lg text-white">
            <MessageCircle className="size-3.5" />
          </a>
        )}
        {showEmail && (
          <a href={`mailto:${profile.email}`} className="flex size-8 items-center justify-center rounded-lg text-white">
            <Mail className="size-3.5" />
          </a>
        )}
      </div>

      <div className="relative px-6 pb-7 pt-20">
        <div className="flex justify-center">
          <img
            src={profile.avatar}
            alt={profile.fullName}
            className="size-24 rounded-2xl border border-white/25 bg-white/10 object-cover backdrop-blur-md"
          />
        </div>

        <div className="mx-2 mt-6 rounded-2xl border border-white/20 bg-white/10 p-4 text-center backdrop-blur-md">
          <p className="text-base font-bold text-white">{profile.fullName}</p>
          {(profile.designation || profile.company) && (
            <p className="mt-0.5 text-xs text-white/70">{[profile.designation, profile.company].filter(Boolean).join(" · ")}</p>
          )}
          {profile.bio && <p className="mt-2 text-[11px] italic text-white/50">&ldquo;{profile.bio}&rdquo;</p>}

          <button
            type="button"
            onClick={() => downloadVCard(profile, showContactInfo)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/15 py-2.5 text-xs font-semibold text-white"
          >
            <UserPlus className="size-3.5" /> Save Contact
          </button>
        </div>

        {profile.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noreferrer"
            className="mx-2 mt-3 flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 py-2.5 text-xs font-semibold text-white backdrop-blur-md"
          >
            <Globe className="size-3.5" /> Visit Website
          </a>
        )}

        <BodySections profile={profile} showContactInfo={showContactInfo} accent={ACCENT} labelColor="text-white/60" chipShape="rounded" ctaColor="#334155" />
      </div>
    </TemplateFrame>
  )
}
