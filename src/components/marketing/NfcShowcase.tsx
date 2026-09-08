import { Nfc } from "lucide-react"
import { resolveIcon } from "@/lib/icon-map"

interface NfcShowcasePoint {
  icon: string
  text: string
}

interface NfcShowcaseProps {
  badge: string
  heading: string
  description: string
  points: NfcShowcasePoint[]
}

export default function NfcShowcase({ badge, heading, description, points }: NfcShowcaseProps) {
  return (
    <section className="overflow-hidden bg-white py-20 sm:py-24">
      <div className="container-page grid items-center gap-16 lg:grid-cols-2">
        {/* Visual mockup */}
        <div className="relative order-2 flex items-center justify-center py-8 lg:order-1">
          <div className="absolute size-72 rounded-full bg-gradient-to-br from-[#4F46E5]/10 via-[#7C3AED]/10 to-[#EC4899]/10 blur-3xl" />

          {/* Phone outline */}
          <div className="relative flex h-[420px] w-[220px] items-center justify-center rounded-[2.5rem] border-[6px] border-slate-900 bg-slate-900 shadow-2xl sm:h-[460px] sm:w-[230px]">
            <span className="absolute left-1/2 top-2.5 h-1.5 w-16 -translate-x-1/2 rounded-full bg-slate-700" />
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#4F46E5] via-[#7C3AED] to-[#EC4899] p-6 text-center">
              <Nfc className="size-10 text-white" />
              <p className="text-sm font-medium text-white/90">
                Hold a VR's NEXORA card near this phone to share a profile
              </p>
            </div>
          </div>

          {/* Card with tap ripple */}
          <div className="absolute -right-2 bottom-16 sm:-right-6">
            <span className="absolute inset-0 -m-7 animate-ping rounded-full bg-[#EC4899]/40 [animation-duration:2s]" />
            <span className="absolute inset-0 -m-3.5 animate-pulse rounded-full bg-[#4F46E5]/30" />
            <div className="relative flex h-16 w-24 items-center justify-center rounded-xl bg-white shadow-xl ring-1 ring-black/5">
              <Nfc className="size-6 text-[#4F46E5]" />
            </div>
          </div>
        </div>

        {/* Copy */}
        <div className="order-1 lg:order-2">
          <span className="inline-flex items-center rounded-full bg-[#4F46E5]/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#4F46E5]">
            {badge}
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{heading}</h2>
          <p className="mt-4 max-w-lg text-muted-foreground">{description}</p>
          <ul className="mt-8 space-y-4">
            {points.map((p) => {
              const Icon = resolveIcon(p.icon)
              return (
                <li key={p.text} className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F46E5] via-[#7C3AED] to-[#EC4899] text-white shadow-md">
                    <Icon className="size-4.5" />
                  </span>
                  <span className="pt-1.5 text-sm font-medium text-foreground">{p.text}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
