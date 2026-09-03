import { Globe, Lock, Nfc } from "lucide-react"
import { cn } from "@/lib/utils"

function ChipIcon() {
  return (
    <div className="relative h-6 w-8 rounded-[4px] bg-gradient-to-br from-yellow-200 via-yellow-400 to-yellow-600 shadow-inner">
      <div className="absolute inset-0.5 rounded-[2px] border border-yellow-700/40" />
      <div className="absolute inset-x-0.5 top-1/2 h-px -translate-y-1/2 bg-yellow-700/40" />
      <div className="absolute inset-y-0.5 left-1/2 w-px -translate-x-1/2 bg-yellow-700/40" />
    </div>
  )
}

function CardFace({ tone }: { tone: "front" | "back" }) {
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-[22px] p-[1.5px]",
        tone === "front" ? "bg-gradient-brand shadow-[0_25px_60px_rgba(124,58,237,0.45)]" : "bg-gradient-to-br from-[#2563EB]/70 to-[#7C3AED]/70",
      )}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[20.5px] bg-gradient-to-br from-[#0B0F1A] via-[#12142B] to-[#1A1030] p-5 text-white">
        {/* brushed-metal texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: "repeating-linear-gradient(115deg, #fff 0px, #fff 1px, transparent 1px, transparent 3px)" }}
        />
        {/* neon reflection sweep */}
        <div className="pointer-events-none absolute -inset-x-1/2 -top-1/2 h-[200%] w-[80%] rotate-12 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="relative flex items-start justify-between">
          <ChipIcon />
          <div className="flex items-center gap-1 text-white/70">
            <span className="text-[10px] font-semibold tracking-wider">NFC</span>
            <Nfc className="size-4 -rotate-90" />
          </div>
        </div>

        <div className="relative mt-4 flex flex-col items-center text-center sm:mt-6">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-primary">
            <Nfc className="size-5" />
          </span>
          <p className="mt-2 text-base font-bold tracking-tight sm:text-lg">TapLink</p>
          <p className="text-[9px] font-medium uppercase tracking-[0.25em] text-white/50">Digital Identity</p>
        </div>

        <div className="relative mt-4 flex items-center justify-between text-white/60 sm:mt-6">
          <div className="flex items-center gap-1.5">
            <Globe className="size-3.5" />
            <span className="text-[8px] font-semibold tracking-[0.15em] sm:text-[9px]">TAP · CONNECT · SHARE</span>
          </div>
          <Lock className="size-3.5" />
        </div>
      </div>
    </div>
  )
}

/**
 * Code-built stand-in for the brand's physical NFC card renders. There's no
 * way to pull an image that only exists inline in a chat message onto disk,
 * so this uses the same visual language (dark metal card, chip, NFC mark,
 * brand-gradient trim) instead of a real photo. Swap in real product photography
 * later by dropping files into src/assets and replacing <CardFace/> with <img/>.
 */
export default function NfcCardShowcase() {
  return (
    <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#0B0F1A] via-[#12142B] to-[#1A0F2E] p-10 shadow-2xl sm:p-14">
      <div className="pointer-events-none absolute left-1/4 top-1/5 size-72 rounded-full bg-[#7C3AED]/30 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-1/5 right-1/4 size-72 rounded-full bg-[#2563EB]/30 blur-[100px]" />

      <div className="relative mx-auto h-[220px] w-full max-w-sm sm:h-[260px]">
        {/* Back card — depth */}
        <div className="absolute inset-0 translate-x-6 translate-y-6 animate-float-slower">
          <div className="h-full w-full rotate-6 opacity-60">
            <CardFace tone="back" />
          </div>
        </div>

        {/* Front card — hero, hover tilt */}
        <div className="absolute inset-0 animate-float-slow">
          <div className="h-full w-full -rotate-3 cursor-pointer transition-transform duration-500 ease-out hover:-rotate-1 hover:scale-[1.03]">
            <CardFace tone="front" />
          </div>
        </div>
      </div>
    </div>
  )
}
