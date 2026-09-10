import { Globe, Mail, MessageCircle, Phone, UserPlus } from "lucide-react"
import { BodySections } from "./BodySections"
import { digitsOnly, downloadVCard, TemplateFrame, type TemplateProps } from "./shared"

const ACCENT = "#7C3AED"

/** Creative — dark glowing gradient background, large glow-ringed centered
 * avatar, name+title+company collapsed into one combined line, glassy icon
 * chips, gradient full-width CTA. Bold/expressive vs. Signature's quiet
 * editorial or Classic's plain white card. */
export default function CreativeTemplate({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const showPhone = showContactInfo && Boolean(profile.phone)
  const showEmail = showContactInfo && Boolean(profile.email)
  const subtitle = [profile.designation, profile.company].filter(Boolean).join(" · ")

  return (
    <TemplateFrame onShare={onShare} bodyClassName="max-h-[660px] overflow-y-auto bg-gradient-to-br from-[#0B0F1A] via-[#12142B] to-[#1A1030]">
      <div className="relative px-6 pb-7 pt-8">
        <div className="pointer-events-none absolute -left-10 top-6 size-40 rounded-full bg-[#7C3AED]/30 blur-[60px]" />
        <div className="pointer-events-none absolute -right-10 bottom-24 size-40 rounded-full bg-[#2563EB]/30 blur-[60px]" />

        <div className="relative flex justify-center">
          <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold tracking-widest text-white/70">DIGITAL IDENTITY</span>
        </div>

        <div className="relative mt-6 flex justify-center">
          <div className="flex size-28 items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] via-[#7C3AED] to-[#EC4899] p-[3px] shadow-[0_0_35px_rgba(124,58,237,0.6)]">
            <img src={profile.avatar} alt={profile.fullName} className="size-full rounded-full border-2 border-[#12142B] object-cover" />
          </div>
        </div>

        <div className="relative mt-4 text-center">
          <p className="text-xl font-extrabold text-white">{profile.fullName}</p>
          {subtitle && <p className="mt-1 text-xs font-medium text-[#C4B5FD]">{subtitle}</p>}
          {profile.bio && <p className="mt-2 text-xs italic text-white/50">&ldquo;{profile.bio}&rdquo;</p>}
        </div>

        <div className="relative mt-5 flex justify-center gap-3">
          {showPhone && (
            <a href={`tel:${profile.phone}`} className="flex size-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white backdrop-blur">
              <Phone className="size-4" />
            </a>
          )}
          <button
            type="button"
            onClick={() => downloadVCard(profile, showContactInfo)}
            className="flex size-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white backdrop-blur"
          >
            <UserPlus className="size-4" />
          </button>
          {showPhone && (
            <a
              href={`https://wa.me/${digitsOnly(profile.phone)}`}
              target="_blank"
              rel="noreferrer"
              className="flex size-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white backdrop-blur"
            >
              <MessageCircle className="size-4" />
            </a>
          )}
          {showEmail && (
            <a href={`mailto:${profile.email}`} className="flex size-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white backdrop-blur">
              <Mail className="size-4" />
            </a>
          )}
        </div>

        <button
          type="button"
          onClick={() => downloadVCard(profile, showContactInfo)}
          className="relative mt-5 w-full rounded-full bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#EC4899] py-3 text-sm font-semibold text-white shadow-lg"
        >
          + Save Contact
        </button>

        {profile.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noreferrer"
            className="relative mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 py-3 text-sm font-semibold text-white backdrop-blur"
          >
            <Globe className="size-4" /> Visit Website
          </a>
        )}

        <div className="relative">
          <BodySections profile={profile} showContactInfo={showContactInfo} accent={ACCENT} labelColor="text-white/50" ctaColor={ACCENT} />
        </div>
      </div>
    </TemplateFrame>
  )
}
