import { Mail, MessageCircle, Phone } from "lucide-react"
import { BodySections } from "./BodySections"
import { digitsOnly, downloadVCard, TemplateFrame, type TemplateProps } from "./shared"

const ACCENT = "#DC2626"

/** Impact — diagonal-cut black banner, huge condensed uppercase name
 * typography, underlined text "icons" instead of icon chips, solid
 * full-width red CTA. The highest-contrast, most editorial-poster template
 * in the set. */
export default function ImpactTemplate({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const showPhone = showContactInfo && Boolean(profile.phone)
  const showEmail = showContactInfo && Boolean(profile.email)

  return (
    <TemplateFrame onShare={onShare} bodyClassName="relative max-h-[660px] overflow-y-auto bg-white">
      <div className="absolute inset-x-0 top-0 h-28 bg-[#0B0F1A]" style={{ clipPath: "polygon(0 0, 100% 0, 100% 55%, 0 100%)" }} />

      <div className="relative flex justify-center pt-6">
        <img src={profile.avatar} alt={profile.fullName} className="size-20 rounded-full border-4 border-white object-cover shadow-lg" />
      </div>

      <div className="relative px-6 pb-7 pt-4 text-center">
        <p className="text-3xl font-black uppercase leading-[0.95] tracking-tight text-[#0B0F1A]">{profile.fullName}</p>
        {profile.designation && <p className="mt-2 text-xs font-bold uppercase tracking-wide text-[#DC2626]">{profile.designation}</p>}
        {profile.company && <p className="text-xs text-slate-500">{profile.company}</p>}
        {profile.bio && <p className="mt-3 text-xs italic text-slate-500">&ldquo;{profile.bio}&rdquo;</p>}

        <div className="mt-5 flex justify-center gap-5 text-xs font-bold uppercase tracking-wide text-[#0B0F1A]">
          {showPhone && (
            <a href={`tel:${profile.phone}`} className="flex items-center gap-1 border-b-2 border-[#DC2626] pb-0.5">
              <Phone className="size-3" /> Call
            </a>
          )}
          {showPhone && (
            <a href={`https://wa.me/${digitsOnly(profile.phone)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 border-b-2 border-[#DC2626] pb-0.5">
              <MessageCircle className="size-3" /> Message
            </a>
          )}
          {showEmail && (
            <a href={`mailto:${profile.email}`} className="flex items-center gap-1 border-b-2 border-[#DC2626] pb-0.5">
              <Mail className="size-3" /> Email
            </a>
          )}
        </div>

        <button
          type="button"
          onClick={() => downloadVCard(profile, showContactInfo)}
          className="mt-5 w-full bg-[#DC2626] py-3 text-center text-xs font-black uppercase tracking-wide text-white"
        >
          + Save Contact
        </button>

        {profile.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex w-full items-center justify-center border-2 border-[#0B0F1A] py-3 text-xs font-black uppercase tracking-wide text-[#0B0F1A]"
          >
            Visit Website
          </a>
        )}

        <BodySections profile={profile} showContactInfo={showContactInfo} accent={ACCENT} chipShape="square" ctaColor={ACCENT} />
      </div>
    </TemplateFrame>
  )
}
