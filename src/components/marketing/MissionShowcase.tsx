import { TypewriterCursor, TypewriterText } from "@/components/marketing/TypewriterText"
import { useTypewriter } from "@/hooks/use-typewriter"

function TargetIllustration() {
  return (
    <div className="relative flex size-56 shrink-0 items-center justify-center sm:size-64">
      {/* decorative corner rings */}
      <span className="absolute left-2 top-0 size-3 rounded-full border-2 border-[var(--public-accent)]/40" />
      <span className="absolute -right-1 top-1/3 size-2.5 rounded-full border-2 border-primary/40" />
      <span className="absolute left-0 bottom-2 size-2.5 rounded-full border-2 border-primary/40" />

      {/* bullseye rings, largest to smallest, each centered via inset-0 + m-auto */}
      <div className="absolute inset-0 m-auto size-56 rounded-full bg-gradient-to-br from-primary/5 to-[var(--public-soft)] shadow-inner dark:from-card dark:to-card sm:size-64" />
      <div className="absolute inset-0 m-auto size-44 rounded-full bg-gradient-to-br from-[var(--public-dot)] to-[var(--public-soft)] opacity-80 sm:size-48" />
      <div className="absolute inset-0 m-auto size-28 rounded-full bg-gradient-brand-br shadow-lg sm:size-32" />
      <div className="absolute inset-0 m-auto size-14 rounded-full bg-card shadow-md sm:size-16" />
      <div className="absolute inset-0 m-auto size-6 rounded-full bg-gradient-brand shadow-glow-primary sm:size-7" />

      {/* dart piercing the center */}
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 m-auto size-28 -translate-x-1 -translate-y-1 rotate-[-45deg] sm:size-32"
        aria-hidden="true"
      >
        <line x1="8" y1="32" x2="20" y2="20" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M20 20 L26 14 L28 20 L20 20 Z" fill="#1E293B" />
        <path d="M8 32 L4 36 M8 32 L11 33 M8 32 L7 36" stroke="#1E293B" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </div>
  )
}

interface MissionShowcaseProps {
  badge: string
  heading: string
  description: string
}

export default function MissionShowcase({ badge, heading, description }: MissionShowcaseProps) {
  const writingRef = useTypewriter<HTMLDivElement>({
    content: JSON.stringify([badge, heading, description]),
    trigger: "viewport",
  })
  // No top padding: follows the About story section on the same background,
  // so its bottom padding already provides the gap.
  return (
    <section className="relative overflow-hidden bg-background pb-6 sm:pb-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, var(--public-dot) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse 55% 55% at 85% 25%, black, transparent)",
        }}
      />
      <div className="pointer-events-none absolute -left-20 top-10 size-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 size-64 rounded-full bg-[var(--public-accent)]/10 blur-3xl" />

      <div className="container-page relative">
        <div className="rounded-[32px] bg-gradient-brand p-[1.5px] shadow-[0_25px_70px_rgba(var(--public-shadow-rgb),0.18)]">
          <div className="glass-panel rounded-[30.5px] px-6 py-8 sm:px-12 sm:py-10">
            <div className="flex flex-col items-center gap-8 lg:flex-row lg:justify-center lg:gap-12">
              <TargetIllustration />

              <div ref={writingRef} className="relative max-w-2xl text-center lg:text-left">
                <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
                  <TypewriterText text={badge} maxDurationMs={250} />
                </span>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"><TypewriterText text={heading} maxDurationMs={1000} /></h2>
                <p className="mx-auto mt-4 max-w-xl text-muted-foreground sm:text-lg lg:mx-0"><TypewriterText text={description} maxDurationMs={1600} /></p>
                <TypewriterCursor />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
