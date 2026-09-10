import { Globe, Mail, MessageCircle, Phone } from "lucide-react"
import { BodySections } from "./BodySections"
import { digitsOnly, downloadVCard, TemplateFrame, type TemplateProps } from "./shared"

const ACCENT = "#38BDF8"
const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)"

/** Future — hexagonal avatar frame, monospace type, angular diagonal-cut CTA,
 * subtle grid-line texture over a blue/cyan gradient. Nothing else in the
 * set uses a clipped geometric avatar or monospace typography. */
export default function FutureTemplate({ profile, onShare, showContactInfo = true }: TemplateProps) {
  const showPhone = showContactInfo && Boolean(profile.phone)
  const showEmail = showContactInfo && Boolean(profile.email)

  return (
    <TemplateFrame onShare={onShare} bodyClassName="relative max-h-[660px] overflow-y-auto bg-gradient-to-br from-[#0C4A6E] via-[#0E3A5F] to-[#1E3A8A]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[340px] opacity-[0.08]"
        style={{
          backgroundImage: "linear-gradient(#7DD3FC 1px, transparent 1px), linear-gradient(90deg, #7DD3FC 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      <div className="relative px-6 pb-7 pt-6">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold tracking-widest text-[#7DD3FC]">VR&apos;S_NEXORA</span>
          <span className="rounded-sm border border-[#38BDF8]/50 bg-[#38BDF8]/10 px-2 py-1 font-mono text-[8px] text-[#7DD3FC]">● ONLINE</span>
        </div>

        <div className="mt-6 flex justify-center">
          <div className="flex size-24 items-center justify-center bg-gradient-to-br from-[#38BDF8] to-white/40 p-[2px]" style={{ clipPath: HEX_CLIP }}>
            <img src={profile.avatar} alt={profile.fullName} className="size-full object-cover" style={{ clipPath: HEX_CLIP }} />
          </div>
        </div>

        <div className="mt-4 text-center">
          <p className="font-mono text-lg font-bold text-white">{profile.fullName}</p>
          {(profile.designation || profile.company) && (
            <p className="font-mono text-[10px] text-[#7DD3FC]">
              {profile.designation && `${profile.designation.replace(/\s/g, "_")}`}
              {profile.designation && profile.company && " // "}
              {profile.company && profile.company.replace(/\s/g, "_")}
            </p>
          )}
          {profile.bio && <p className="mt-2 font-mono text-[10px] text-white/50">&ldquo;{profile.bio}&rdquo;</p>}
        </div>

        <div className="mt-4 flex justify-center gap-3">
          {showPhone && (
            <a href={`tel:${profile.phone}`} className="flex size-9 items-center justify-center rounded-md border border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#7DD3FC]">
              <Phone className="size-3.5" />
            </a>
          )}
          {showPhone && (
            <a
              href={`https://wa.me/${digitsOnly(profile.phone)}`}
              target="_blank"
              rel="noreferrer"
              className="flex size-9 items-center justify-center rounded-md border border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#7DD3FC]"
            >
              <MessageCircle className="size-3.5" />
            </a>
          )}
          {showEmail && (
            <a href={`mailto:${profile.email}`} className="flex size-9 items-center justify-center rounded-md border border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#7DD3FC]">
              <Mail className="size-3.5" />
            </a>
          )}
        </div>

        <button
          type="button"
          onClick={() => downloadVCard(profile, showContactInfo)}
          className="mt-5 w-full bg-gradient-to-r from-[#38BDF8] to-[#1E3A8A] py-3 text-center text-xs font-bold text-white"
          style={{ clipPath: "polygon(6% 0, 100% 0, 94% 100%, 0 100%)" }}
        >
          + SAVE CONTACT
        </button>

        {profile.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 border border-[#38BDF8]/40 bg-[#38BDF8]/10 py-3 text-xs font-bold text-[#7DD3FC]"
            style={{ clipPath: "polygon(6% 0, 100% 0, 94% 100%, 0 100%)" }}
          >
            <Globe className="size-4" /> VISIT_WEBSITE
          </a>
        )}

        <BodySections profile={profile} showContactInfo={showContactInfo} accent={ACCENT} labelColor="text-[#7DD3FC]/70" chipShape="rounded" ctaColor="#0E3A5F" />
      </div>
    </TemplateFrame>
  )
}
