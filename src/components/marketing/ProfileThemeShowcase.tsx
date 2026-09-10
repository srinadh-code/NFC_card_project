import { Globe, Mail, MessageCircle, Nfc, Phone, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { cardClass } from "@/components/marketing/PremiumCard"
import type { ProfileTheme } from "@/data/constants"

// Code-built phone mockups — one genuinely different composition per
// theme (not a shared template with swapped colors): header structure,
// avatar shape/placement, typography, button style, and icon arrangement
// all vary. See PROFILE_THEMES in data/constants.ts for why there are no
// image assets backing these (same reasoning as NfcCardFace's card
// preview — nothing to crop a chat-pasted screenshot into on disk). A
// generic silhouette avatar + "Your Name" placeholder stand in for the
// real person shown in the reference designs.

const BRAND_MARK = (
  <span className="flex size-4 items-center justify-center rounded bg-gradient-brand">
    <Nfc className="size-2.5 text-white" />
  </span>
)

function PhoneFrame({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[220px] rounded-[28px] border-[6px] border-[#0B0F1A] bg-[#0B0F1A] shadow-xl">
      <div className={cn("relative flex h-[340px] flex-col overflow-hidden rounded-[22px]", bg)}>
        <div className="absolute left-1/2 top-1.5 z-10 h-3 w-16 -translate-x-1/2 rounded-full bg-[#0B0F1A]" />
        {children}
      </div>
    </div>
  )
}

// --- 1. Classic — symmetric, centered, restrained. Logo → photo → name/
// title/company → full-width button → simple icon row. -----------------
function ClassicMockup() {
  return (
    <PhoneFrame bg="bg-white p-4">
      <div className="mt-4 flex items-center justify-center gap-1.5">
        {BRAND_MARK}
        <span className="text-[9px] font-bold tracking-wide text-[#0B0F1A]">VR&apos;s NEXORA</span>
      </div>

      <div className="mt-5 flex justify-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-[#F1F5F9] ring-2 ring-[#E2E8F0]">
          <User className="size-7 text-slate-400" />
        </div>
      </div>

      <div className="mt-3 text-center">
        <p className="text-sm font-bold text-[#0B0F1A]">Your Name</p>
        <p className="text-[10px] font-medium text-[#4F46E5]">Your Title</p>
        <p className="mt-1 text-[8px] text-slate-500">Your Company</p>
      </div>

      <div className="mt-4 rounded-full bg-[#0B0F1A] py-1.5 text-center text-[9px] font-semibold text-white">
        + Save Contact
      </div>

      <div className="mt-3 flex justify-center gap-2">
        {[Phone, MessageCircle, Mail].map((Icon, i) => (
          <span key={i} className="flex size-7 items-center justify-center rounded-lg bg-[#F1F5F9] text-slate-600">
            <Icon className="size-3" />
          </span>
        ))}
      </div>
    </PhoneFrame>
  )
}

// --- 2. Signature — asymmetric editorial split: text block left, photo
// offset right, thin accent rule, left-aligned outlined button. --------
function SignatureMockup() {
  return (
    <PhoneFrame bg="bg-gradient-to-br from-[#FFF7ED] to-[#FDE1C7] p-4">
      <div className="pointer-events-none absolute -right-8 top-16 size-28 rounded-full bg-[#FDBA74]/30 blur-[45px]" />

      <div className="relative mt-4 flex items-center gap-1.5">
        {BRAND_MARK}
        <span className="text-[8px] font-bold tracking-wide text-[#7C2D12]">VR&apos;s NEXORA</span>
      </div>

      <div className="relative mt-4 flex items-start justify-between gap-2">
        <div className="pt-2 text-left">
          <p className="font-serif text-lg italic leading-tight text-[#7C2D12]">
            Your
            <br />
            Name
          </p>
          <p className="mt-1 text-[9px] font-medium text-[#92400E]">Your Title</p>
        </div>
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/70 ring-1 ring-white">
          <User className="size-6 text-[#92400E]/60" />
        </div>
      </div>

      <div className="relative mt-3 border-t border-[#92400E]/20 pt-2 text-[8px] italic text-[#92400E]/70">
        &ldquo;Create · Connect · Grow&rdquo;
      </div>

      <div className="relative mt-3 inline-block rounded-full border border-[#92400E] px-4 py-1.5 text-[9px] font-semibold text-[#92400E]">
        + Save Contact
      </div>

      <div className="relative mt-3 flex justify-end gap-2">
        {[Phone, Globe, Mail].map((Icon, i) => (
          <span key={i} className="flex size-6 items-center justify-center rounded-full bg-white/70 text-[#92400E]">
            <Icon className="size-3" />
          </span>
        ))}
      </div>
    </PhoneFrame>
  )
}

// --- 3. Creative — large glowing centered photo, glass-card icons below
// a combined title line, gradient CTA placed last (reversed order). ----
function CreativeMockup() {
  return (
    <PhoneFrame bg="bg-gradient-to-br from-[#0B0F1A] via-[#12142B] to-[#1A1030] p-4">
      <div className="pointer-events-none absolute -left-6 top-10 size-32 rounded-full bg-[#7C3AED]/30 blur-[50px]" />
      <div className="pointer-events-none absolute -right-8 bottom-16 size-32 rounded-full bg-[#2563EB]/30 blur-[50px]" />

      <div className="relative mt-4 flex justify-center">
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[7px] font-bold tracking-widest text-white/70">
          DIGITAL IDENTITY
        </span>
      </div>

      <div className="relative mt-4 flex justify-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] via-[#7C3AED] to-[#EC4899] p-[3px] shadow-[0_0_25px_rgba(124,58,237,0.6)]">
          <div className="flex size-full items-center justify-center rounded-full bg-[#12142B]">
            <User className="size-8 text-white/80" />
          </div>
        </div>
      </div>

      <div className="relative mt-3 text-center">
        <p className="text-base font-extrabold text-white">Your Name</p>
        <p className="text-[9px] font-medium text-[#C4B5FD]">Your Title · Your Company</p>
      </div>

      <div className="relative mt-3 flex justify-center gap-2">
        {[Phone, MessageCircle, Mail].map((Icon, i) => (
          <span
            key={i}
            className="flex size-8 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white backdrop-blur"
          >
            <Icon className="size-3.5" />
          </span>
        ))}
      </div>

      <div className="relative mt-3 rounded-full bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#EC4899] py-1.5 text-center text-[9px] font-semibold text-white">
        + Save Contact
      </div>
    </PhoneFrame>
  )
}

// --- 4. Executive — banner header (photo + name side-by-side), then
// structured label:value info blocks, no icon grid at all. -------------
function ExecutiveMockup() {
  return (
    <PhoneFrame bg="bg-gradient-to-b from-[#0F172A] to-[#1E293B] p-4">
      <div className="relative mt-5 flex items-center gap-3 border-b border-white/15 pb-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md border border-[#CBD5E1]/40 bg-white/5">
          <User className="size-6 text-[#CBD5E1]" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Your Name</p>
          <p className="text-[9px] font-medium text-[#94A3B8]">Your Title</p>
        </div>
      </div>

      <div className="relative mt-3 space-y-2">
        <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
          <span className="text-[7px] font-bold uppercase tracking-widest text-[#94A3B8]">Company</span>
          <span className="text-[9px] font-semibold text-white">Your Company</span>
        </div>
        <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
          <span className="text-[7px] font-bold uppercase tracking-widest text-[#94A3B8]">Status</span>
          <span className="text-[9px] font-semibold text-white">Available to connect</span>
        </div>
      </div>

      <div className="relative mt-auto rounded-sm border border-[#CBD5E1]/50 py-1.5 text-center text-[9px] font-semibold tracking-wide text-white">
        + SAVE CONTACT
      </div>
    </PhoneFrame>
  )
}

// --- 5. Luxury — minimal editorial: small square-framed photo, huge
// name typography, single gold rule, no icon grid at all. --------------
function LuxuryMockup() {
  return (
    <PhoneFrame bg="bg-gradient-to-b from-[#0B0B0F] to-[#151515] p-4">
      <div className="relative mt-4 flex items-center justify-between">
        <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#FBBF24]">Nexora</span>
        <div className="flex size-9 items-center justify-center rounded-md border border-[#FBBF24]/50">
          <User className="size-4 text-[#FBBF24]/70" />
        </div>
      </div>

      <div className="relative mt-10">
        <p className="text-2xl font-bold leading-[1.05] text-white">
          Your
          <br />
          Name
        </p>
        <div className="mt-3 h-px w-10 bg-[#FBBF24]" />
        <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#FBBF24]">Your Title</p>
        <p className="mt-0.5 text-[8px] text-white/40">Your Company</p>
      </div>

      <div className="relative mt-auto flex items-center justify-between border-t border-[#FBBF24]/20 pt-3">
        <span className="text-[8px] text-white/40">Executive Profile</span>
        <span className="rounded-sm border border-[#FBBF24] px-3 py-1 text-[8px] font-semibold tracking-wide text-[#FBBF24]">
          Contact →
        </span>
      </div>
    </PhoneFrame>
  )
}

// --- 6. Future — hexagonal photo frame, monospace type, angular
// diagonal icon row, geometric-cut CTA, grid-line texture. -------------
function FutureMockup() {
  return (
    <PhoneFrame bg="bg-gradient-to-br from-[#0C4A6E] via-[#0E3A5F] to-[#1E3A8A] p-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(#7DD3FC 1px, transparent 1px), linear-gradient(90deg, #7DD3FC 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      />

      <div className="relative mt-4 flex items-center justify-between">
        <span className="font-mono text-[8px] font-bold tracking-widest text-[#7DD3FC]">VR&apos;S_NEXORA</span>
        <span className="rounded-sm border border-[#38BDF8]/50 bg-[#38BDF8]/10 px-1.5 py-0.5 font-mono text-[6px] text-[#7DD3FC]">
          ● ONLINE
        </span>
      </div>

      <div className="relative mt-4 flex justify-center">
        <div
          className="flex size-16 items-center justify-center bg-gradient-to-br from-[#38BDF8] to-white/40 p-[2px]"
          style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
        >
          <div
            className="flex size-full items-center justify-center bg-[#0E3A5F]"
            style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
          >
            <User className="size-6 text-white/80" />
          </div>
        </div>
      </div>

      <div className="relative mt-3 text-center">
        <p className="font-mono text-sm font-bold text-white">Your Name</p>
        <p className="font-mono text-[8px] text-[#7DD3FC]">Your_Title // Your_Company</p>
      </div>

      <div className="relative mt-3 flex justify-center gap-3">
        {[Phone, MessageCircle, Mail].map((Icon, i) => (
          <span
            key={i}
            className="flex size-7 items-center justify-center rounded-md border border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#7DD3FC]"
          >
            <Icon className="size-3" />
          </span>
        ))}
      </div>

      <div
        className="relative mt-3 bg-gradient-to-r from-[#38BDF8] to-[#1E3A8A] py-1.5 text-center text-[9px] font-bold text-white"
        style={{ clipPath: "polygon(6% 0, 100% 0, 94% 100%, 0 100%)" }}
      >
        + SAVE CONTACT
      </div>
    </PhoneFrame>
  )
}

// --- 7. Nature — organic blob-shaped photo frame, soft botanical blobs,
// full pill CTA. Same general flow as Classic, but nothing about its
// shape language (blob avatar, pill button, soft green palette) repeats
// any other theme. ------------------------------------------------------
function NatureMockup() {
  return (
    <PhoneFrame bg="bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7] p-4">
      <div className="pointer-events-none absolute -left-8 -top-8 size-28 rounded-full bg-[#86EFAC]/40 blur-[40px]" />
      <div className="pointer-events-none absolute -right-6 bottom-20 size-24 rounded-full bg-[#4ADE80]/30 blur-[35px]" />

      <div className="relative mt-4 flex justify-center gap-1.5">
        {BRAND_MARK}
        <span className="text-[8px] font-bold tracking-wide text-[#166534]">VR&apos;s NEXORA</span>
      </div>

      <div className="relative mt-5 flex justify-center">
        <div
          className="flex size-20 items-center justify-center bg-gradient-to-br from-[#BBF7D0] to-white p-[3px]"
          style={{ borderRadius: "62% 38% 55% 45% / 45% 55% 45% 55%" }}
        >
          <div
            className="flex size-full items-center justify-center bg-white/60"
            style={{ borderRadius: "62% 38% 55% 45% / 45% 55% 45% 55%" }}
          >
            <User className="size-7 text-[#166534]/60" />
          </div>
        </div>
      </div>

      <div className="relative mt-3 text-center">
        <p className="text-sm font-semibold text-[#14532D]">Your Name</p>
        <p className="text-[10px] text-[#166534]">Your Title</p>
      </div>

      <div className="relative mt-3 flex justify-center gap-2">
        {[Phone, MessageCircle, Mail].map((Icon, i) => (
          <span key={i} className="flex size-7 items-center justify-center rounded-full bg-white/70 text-[#166534]">
            <Icon className="size-3" />
          </span>
        ))}
      </div>

      <div className="relative mt-3 rounded-full bg-[#166534] py-2 text-center text-[9px] font-semibold text-white">
        + Save Contact
      </div>
    </PhoneFrame>
  )
}

// --- 8. Glass — two separate floating frosted panels (an icon chip
// overlapping top-right, a name/CTA card overlapping the bottom), unlike
// Creative's single-column glow structure. ------------------------------
function GlassMockup() {
  return (
    <PhoneFrame bg="bg-gradient-to-br from-[#1E293B] via-[#334155] to-[#0F172A]">
      <div className="pointer-events-none absolute left-4 top-14 size-24 rounded-full bg-[#38BDF8]/30 blur-[40px]" />
      <div className="pointer-events-none absolute right-2 top-28 size-20 rounded-full bg-[#A78BFA]/30 blur-[35px]" />

      <div className="absolute right-3 top-10 z-[1] flex gap-1.5 rounded-2xl border border-white/20 bg-white/10 p-1.5 backdrop-blur-md">
        {[Phone, MessageCircle, Mail].map((Icon, i) => (
          <span key={i} className="flex size-5 items-center justify-center rounded-lg text-white">
            <Icon className="size-2.5" />
          </span>
        ))}
      </div>

      <div className="relative mt-16 flex justify-center">
        <div className="flex size-16 items-center justify-center rounded-2xl border border-white/25 bg-white/10 backdrop-blur-md">
          <User className="size-7 text-white/80" />
        </div>
      </div>

      <div className="relative mx-4 mt-6 rounded-2xl border border-white/20 bg-white/10 p-3 text-center backdrop-blur-md">
        <p className="text-sm font-bold text-white">Your Name</p>
        <p className="text-[9px] text-white/70">Your Title · Your Company</p>
        <div className="mt-2 rounded-xl border border-white/30 bg-white/15 py-1.5 text-[9px] font-semibold text-white">
          + Save Contact
        </div>
      </div>
    </PhoneFrame>
  )
}

// --- 9. Impact — diagonal-cut banner, huge condensed typography,
// text-link "icons" (no chips at all), solid full-width CTA. ------------
function ImpactMockup() {
  return (
    <PhoneFrame bg="bg-white">
      <div
        className="absolute inset-x-0 top-0 h-24 bg-[#0B0F1A]"
        style={{ clipPath: "polygon(0 0, 100% 0, 100% 60%, 0 100%)" }}
      />
      <div className="relative flex items-center gap-1.5 p-4">
        {BRAND_MARK}
        <span className="text-[8px] font-bold tracking-wide text-white">VR&apos;s NEXORA</span>
      </div>

      <div className="relative mt-8 px-4">
        <p className="text-3xl font-black uppercase leading-[0.95] text-[#0B0F1A]">
          Your
          <br />
          Name
        </p>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[#DC2626]">Your Title</p>
        <p className="text-[8px] text-slate-500">Your Company</p>
      </div>

      <div className="relative mt-4 flex justify-center gap-4 px-4 text-[8px] font-bold uppercase tracking-wide text-[#0B0F1A]">
        <span className="border-b-2 border-[#DC2626] pb-0.5">Call</span>
        <span className="border-b-2 border-[#DC2626] pb-0.5">Message</span>
        <span className="border-b-2 border-[#DC2626] pb-0.5">Email</span>
      </div>

      <div className="relative mt-auto bg-[#DC2626] py-2.5 text-center text-[10px] font-black uppercase tracking-wide text-white">
        + Save Contact
      </div>
    </PhoneFrame>
  )
}

// Exported so other surfaces that need the exact same 9 visual designs
// (e.g. the /qr-code template picker) can reuse them as-is instead of
// re-implementing — this file stays the one source of truth for what each
// theme id looks like.
export const MOCKUPS: Record<string, () => React.ReactElement> = {
  classic: ClassicMockup,
  signature: SignatureMockup,
  creative: CreativeMockup,
  executive: ExecutiveMockup,
  luxury: LuxuryMockup,
  future: FutureMockup,
  nature: NatureMockup,
  glass: GlassMockup,
  impact: ImpactMockup,
}

export function PhoneMockup({ theme }: { theme: ProfileTheme }) {
  const Mockup = MOCKUPS[theme.id] ?? ClassicMockup
  return <Mockup />
}

interface ProfileThemeShowcaseProps {
  themes: ProfileTheme[]
}

// Pure showcase — no selection state, no click interaction, no CTA. Each
// card just displays a theme's design so the customer can see what's
// included with their plan.
export default function ProfileThemeShowcase({ themes }: ProfileThemeShowcaseProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-6",
        themes.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : themes.length === 2 ? "sm:grid-cols-2" : "",
      )}
    >
      {themes.map((theme) => (
        <div key={theme.id} className={cn(cardClass, "flex flex-col items-center p-6 text-center")}>
          <PhoneMockup theme={theme} />

          <p className="mt-5 text-lg font-bold text-foreground">{theme.name.replace("NEXORA ", "")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{theme.tagline}</p>
        </div>
      ))}
    </div>
  )
}
