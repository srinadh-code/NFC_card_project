import { Globe, Mail, MessageCircle, Phone, UserPlus } from "lucide-react"
import { BodySections } from "./BodySections"
import { digitsOnly, downloadVCard, TemplateFrame, type TemplateProps } from "./shared"

const ACCENT = "#92400E"

/** Signature — asymmetric warm editorial split: serif italic name block on
 * the left, photo offset to the right, thin accent rule, left-aligned
 * outlined pill CTA. Genuinely different composition from Classic (which is
 * centered/symmetric) rather than a recolor of it. */
export default function SignatureTemplate({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const { showPhone, showEmail } = deriveContact(profile, showContactInfo)

  return (
    <TemplateFrame onShare={onShare} bodyClassName="max-h-[660px] overflow-y-auto">
      <div className="relative h-32 w-full shrink-0 overflow-hidden bg-gradient-to-br from-[#FFF7ED] to-[#FDE1C7]">
        <div className="pointer-events-none absolute -right-10 top-8 size-40 rounded-full bg-[#FDBA74]/40 blur-[55px]" />
        {profile.coverImage && <img src={profile.coverImage} alt="" className="absolute inset-0 size-full object-cover opacity-30" />}
      </div>

      <div className="px-6 pb-7 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="pt-1 text-left">
            <p className="font-serif text-2xl italic leading-tight text-[#7C2D12]">{profile.fullName}</p>
            {profile.designation && <p className="mt-1 text-sm font-semibold text-[#92400E]">{profile.designation}</p>}
            {profile.company && <p className="text-xs text-[#92400E]/70">{profile.company}</p>}
          </div>
          <img
            src={profile.avatar}
            alt={profile.fullName}
            className="size-16 shrink-0 rounded-full border-4 border-white object-cover shadow-lg ring-1 ring-[#FDBA74]/60"
          />
        </div>

        {profile.bio && (
          <p className="mt-4 border-t border-[#92400E]/20 pt-3 text-xs italic text-[#92400E]/80">&ldquo;{profile.bio}&rdquo;</p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => downloadVCard(profile, showContactInfo)}
            className="flex items-center gap-2 rounded-full border-2 border-[#92400E] px-4 py-2 text-xs font-semibold text-[#92400E] transition-colors hover:bg-[#92400E] hover:text-white"
          >
            <UserPlus className="size-3.5" /> Save Contact
          </button>
          <div className="flex gap-2">
            {showPhone && (
              <a href={`tel:${profile.phone}`} className="flex size-9 items-center justify-center rounded-full bg-white/70 text-[#92400E] ring-1 ring-[#92400E]/30">
                <Phone className="size-3.5" />
              </a>
            )}
            {showPhone && (
              <a
                href={`https://wa.me/${digitsOnly(profile.phone)}`}
                target="_blank"
                rel="noreferrer"
                className="flex size-9 items-center justify-center rounded-full bg-white/70 text-[#92400E] ring-1 ring-[#92400E]/30"
              >
                <MessageCircle className="size-3.5" />
              </a>
            )}
            {showEmail && (
              <a href={`mailto:${profile.email}`} className="flex size-9 items-center justify-center rounded-full bg-white/70 text-[#92400E] ring-1 ring-[#92400E]/30">
                <Mail className="size-3.5" />
              </a>
            )}
          </div>
        </div>

        {profile.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex w-full items-center justify-between rounded-full border-2 border-[#92400E] px-5 py-3 text-sm font-semibold text-[#92400E] transition-colors hover:bg-[#92400E] hover:text-white"
          >
            <span className="flex items-center gap-2">
              <Globe className="size-4" />
              Visit Website
            </span>
          </a>
        )}

        <BodySections profile={profile} showContactInfo={showContactInfo} accent={ACCENT} ctaColor={ACCENT} />
      </div>
    </TemplateFrame>
  )
}

function deriveContact(profile: TemplateProps["profile"], showContactInfo: boolean) {
  return { showPhone: showContactInfo && Boolean(profile.phone), showEmail: showContactInfo && Boolean(profile.email) }
}
