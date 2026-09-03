import { Briefcase, Camera, AtSign, MessageCircle } from "lucide-react"

const SOCIAL_ICONS = [Briefcase, Camera, AtSign, MessageCircle]
const ACTIONS = ["Save Contact", "Share Profile", "Visit Website"]

/** Static example profile preview — same phone-mockup language used on the
 * homepage hero, reused here as a marketing visual (not wired to real data). */
export default function ProfilePhonePreview({ className }: { className?: string }) {
  return (
    <div
      className={`relative flex h-[300px] w-[170px] items-center justify-center rounded-[2.25rem] border-[6px] border-[#0F172A] bg-[#0F172A] shadow-2xl ${className ?? ""}`}
    >
      <span className="absolute left-1/2 top-2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-white/20" />
      <div className="flex h-full w-full flex-col items-center gap-2.5 overflow-hidden rounded-[1.85rem] bg-gradient-brand-br px-4 pb-4 pt-8 text-center">
        <img
          src="https://api.dicebear.com/9.x/notionists/svg?seed=alex-morgan"
          alt=""
          className="size-12 rounded-full border-2 border-white/70 object-cover"
        />
        <div>
          <p className="text-xs font-bold text-white">Alex Morgan</p>
          <p className="text-[10px] text-white/75">Product Designer</p>
        </div>
        <div className="flex items-center gap-1.5">
          {SOCIAL_ICONS.map((Icon, i) => (
            <span key={i} className="flex size-5 items-center justify-center rounded-full bg-white/15 text-white">
              <Icon className="size-3" />
            </span>
          ))}
        </div>
        <div className="mt-auto flex w-full flex-col gap-1.5">
          {ACTIONS.map((label, i) => (
            <span
              key={label}
              className={
                i === 0
                  ? "rounded-lg bg-white/95 py-1.5 text-[10px] font-semibold text-[#4F46E5] shadow-sm"
                  : "rounded-lg border border-white/40 py-1.5 text-[10px] font-semibold text-white"
              }
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
