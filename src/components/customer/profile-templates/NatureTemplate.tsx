import { Globe, Mail, MessageCircle, Phone } from "lucide-react"
import { BodySections } from "./BodySections"
import { digitsOnly, downloadVCard, TemplateFrame, type TemplateProps } from "./shared"

const ACCENT = "#166534"
const BLOB_RADIUS = "62% 38% 55% 45% / 45% 55% 45% 55%"

/** Nature — organic "blob"-shaped avatar frame (not circular, not square),
 * soft green gradient with blurred botanical shapes, full pill CTA. Same
 * general flow as Classic but nothing about the shape language repeats it. */
export default function NatureTemplate({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const showPhone = showContactInfo && Boolean(profile.phone)
  const showEmail = showContactInfo && Boolean(profile.email)

  return (
    <TemplateFrame onShare={onShare} bodyClassName="relative max-h-[660px] overflow-y-auto bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7]">
      <div className="pointer-events-none absolute -left-10 -top-10 size-40 rounded-full bg-[#86EFAC]/40 blur-[50px]" />
      <div className="pointer-events-none absolute -right-8 top-40 size-32 rounded-full bg-[#4ADE80]/30 blur-[45px]" />

      <div className="relative px-6 pb-7 pt-8">
        <div className="flex justify-center">
          <div className="flex size-28 items-center justify-center bg-gradient-to-br from-[#BBF7D0] to-white p-[3px]" style={{ borderRadius: BLOB_RADIUS }}>
            <img src={profile.avatar} alt={profile.fullName} className="size-full object-cover" style={{ borderRadius: BLOB_RADIUS }} />
          </div>
        </div>

        <div className="mt-4 text-center">
          <p className="text-lg font-semibold text-[#14532D]">{profile.fullName}</p>
          {profile.designation && <p className="text-sm text-[#166534]">{profile.designation}</p>}
          {profile.company && <p className="text-xs text-[#166534]/70">{profile.company}</p>}
          {profile.bio && <p className="mt-2 text-xs italic text-[#166534]/70">&ldquo;{profile.bio}&rdquo;</p>}
        </div>

        <div className="mt-5 flex justify-center gap-3">
          {showPhone && (
            <a href={`tel:${profile.phone}`} className="flex size-10 items-center justify-center rounded-full bg-white/70 text-[#166534] shadow-sm">
              <Phone className="size-4" />
            </a>
          )}
          {showPhone && (
            <a
              href={`https://wa.me/${digitsOnly(profile.phone)}`}
              target="_blank"
              rel="noreferrer"
              className="flex size-10 items-center justify-center rounded-full bg-white/70 text-[#166534] shadow-sm"
            >
              <MessageCircle className="size-4" />
            </a>
          )}
          {showEmail && (
            <a href={`mailto:${profile.email}`} className="flex size-10 items-center justify-center rounded-full bg-white/70 text-[#166534] shadow-sm">
              <Mail className="size-4" />
            </a>
          )}
        </div>

        <button
          type="button"
          onClick={() => downloadVCard(profile, showContactInfo)}
          className="mt-5 w-full rounded-full bg-[#166534] py-3 text-center text-sm font-semibold text-white shadow-sm"
        >
          + Save Contact
        </button>

        {profile.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-[#166534]/40 bg-white/60 py-3 text-sm font-semibold text-[#166534]"
          >
            <Globe className="size-4" /> Visit Website
          </a>
        )}

        <BodySections profile={profile} showContactInfo={showContactInfo} accent={ACCENT} labelColor="text-[#166534]/70" ctaColor={ACCENT} />
      </div>
    </TemplateFrame>
  )
}
