import { Globe, Mail, Phone } from "lucide-react"
import { BodySections } from "./BodySections"
import { downloadVCard, TemplateFrame, type TemplateProps } from "./shared"

const ACCENT = "#CBD5E1"

/** Executive — dark banner header with a square (not circular) photo frame
 * beside the name, then structured label:value info rows instead of an icon
 * grid, and a bordered outline CTA. Deliberately no icon-chip row at all —
 * the opposite arrangement from Creative/Signature. */
export default function ExecutiveTemplate({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const showPhone = showContactInfo && Boolean(profile.phone)
  const showEmail = showContactInfo && Boolean(profile.email)

  return (
    <TemplateFrame onShare={onShare} bodyClassName="max-h-[660px] overflow-y-auto bg-gradient-to-b from-[#0F172A] to-[#1E293B]">
      <div className="px-6 pb-7 pt-8">
        <div className="flex items-center gap-4 border-b border-white/15 pb-5">
          <img src={profile.avatar} alt={profile.fullName} className="size-16 shrink-0 rounded-md border border-[#CBD5E1]/40 object-cover" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-white">{profile.fullName}</p>
            {profile.designation && <p className="truncate text-xs font-medium text-[#94A3B8]">{profile.designation}</p>}
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {profile.company && (
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#94A3B8]">Company</span>
              <span className="text-xs font-semibold text-white">{profile.company}</span>
            </div>
          )}
          {showPhone && (
            <a href={`tel:${profile.phone}`} className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[#94A3B8]">
                <Phone className="size-3" /> Phone
              </span>
              <span className="text-xs font-semibold text-white">{profile.phone}</span>
            </a>
          )}
          {showEmail && (
            <a href={`mailto:${profile.email}`} className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[#94A3B8]">
                <Mail className="size-3" /> Email
              </span>
              <span className="truncate text-xs font-semibold text-white">{profile.email}</span>
            </a>
          )}
          {profile.website && (
            <a href={profile.website} target="_blank" rel="noreferrer" className="flex items-center justify-between pb-2">
              <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[#94A3B8]">
                <Globe className="size-3" /> Website
              </span>
              <span className="truncate text-xs font-semibold text-white">{profile.website.replace(/^https?:\/\//, "")}</span>
            </a>
          )}
        </div>

        {profile.bio && <p className="mt-4 text-xs italic text-[#94A3B8]">&ldquo;{profile.bio}&rdquo;</p>}

        <button
          type="button"
          onClick={() => downloadVCard(profile, showContactInfo)}
          className="mt-5 w-full rounded-sm border border-[#CBD5E1]/50 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-white/10"
        >
          + Save Contact
        </button>

        <BodySections profile={profile} showContactInfo={showContactInfo} accent={ACCENT} labelColor="text-[#94A3B8]" chipShape="square" ctaColor="#334155" />
      </div>
    </TemplateFrame>
  )
}
