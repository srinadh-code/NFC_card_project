import { Mail, MessageCircle, Phone, UserPlus } from "lucide-react"
import { BodySections } from "./BodySections"
import { digitsOnly, downloadVCard, TemplateFrame, type TemplateProps } from "./shared"

const ACCENT = "#FBBF24"

/** Luxury — near-black minimal editorial: small square photo frame top
 * right, huge name typography, a single gold rule, no icon grid at all. The
 * most restrained/oversized-type template of the nine. */
export default function LuxuryTemplate({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const showPhone = showContactInfo && Boolean(profile.phone)
  const showEmail = showContactInfo && Boolean(profile.email)

  return (
    <TemplateFrame onShare={onShare} bodyClassName="max-h-[660px] overflow-y-auto bg-gradient-to-b from-[#0B0B0F] to-[#151515]">
      <div className="px-6 pb-7 pt-8">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#FBBF24]">Nexora</span>
          <img src={profile.avatar} alt={profile.fullName} className="size-12 rounded-md border border-[#FBBF24]/50 object-cover" />
        </div>

        <div className="mt-10">
          <p className="text-3xl font-bold leading-[1.05] text-white">{profile.fullName}</p>
          <div className="mt-4 h-px w-12 bg-[#FBBF24]" />
          {profile.designation && (
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.15em] text-[#FBBF24]">{profile.designation}</p>
          )}
          {profile.company && <p className="mt-1 text-xs text-white/40">{profile.company}</p>}
          {profile.bio && <p className="mt-3 text-xs italic text-white/50">&ldquo;{profile.bio}&rdquo;</p>}
        </div>

        <div className="mt-6 flex items-center gap-3">
          {showPhone && (
            <a href={`tel:${profile.phone}`} className="flex size-9 items-center justify-center rounded-sm border border-[#FBBF24]/40 text-[#FBBF24]">
              <Phone className="size-3.5" />
            </a>
          )}
          {showPhone && (
            <a
              href={`https://wa.me/${digitsOnly(profile.phone)}`}
              target="_blank"
              rel="noreferrer"
              className="flex size-9 items-center justify-center rounded-sm border border-[#FBBF24]/40 text-[#FBBF24]"
            >
              <MessageCircle className="size-3.5" />
            </a>
          )}
          {showEmail && (
            <a href={`mailto:${profile.email}`} className="flex size-9 items-center justify-center rounded-sm border border-[#FBBF24]/40 text-[#FBBF24]">
              <Mail className="size-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => downloadVCard(profile, showContactInfo)}
            className="flex size-9 items-center justify-center rounded-sm border border-[#FBBF24]/40 text-[#FBBF24]"
            aria-label="Save contact"
          >
            <UserPlus className="size-3.5" />
          </button>
        </div>

        {profile.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noreferrer"
            className="mt-6 flex items-center justify-between border-t border-[#FBBF24]/20 pt-4 text-xs"
          >
            <span className="text-white/40">Executive Profile</span>
            <span className="rounded-sm border border-[#FBBF24] px-3 py-1 font-semibold tracking-wide text-[#FBBF24]">Visit Site →</span>
          </a>
        )}

        <BodySections profile={profile} showContactInfo={showContactInfo} accent={ACCENT} labelColor="text-white/40" chipShape="square" ctaColor="#151515" />
      </div>
    </TemplateFrame>
  )
}
