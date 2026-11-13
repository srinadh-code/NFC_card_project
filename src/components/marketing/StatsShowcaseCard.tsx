import { resolveIcon } from "@/lib/icon-map"
import type { Statistic } from "@/types/content"
import { useStatCounters } from "@/hooks/use-stat-counters"

interface StatsShowcaseCardProps {
  statistics: Statistic[]
}

export default function StatsShowcaseCard({ statistics }: StatsShowcaseCardProps) {
  const statisticsRef = useStatCounters(statistics, { compact: false })
  if (statistics.length === 0) return null

  return (
    // Vertical spacing comes from the neighbouring sections (Mission above,
    // Why Choose below) so the two showcase cards read as one group.
    <section className="bg-background">
      <div className="container-page">
        <div className="rounded-[32px] bg-gradient-brand p-[1.5px] shadow-[0_25px_70px_rgba(var(--public-shadow-rgb),0.18)]">
          <div className="relative overflow-hidden rounded-[30.5px] bg-gradient-to-br from-[var(--public-soft)] via-white to-[var(--public-soft)] px-6 py-10 dark:from-card dark:via-card dark:to-card sm:px-10">
            <div className="pointer-events-none absolute -left-10 -top-10 size-56 rounded-full bg-primary/10 blur-3xl" />
            <div className="pointer-events-none absolute -right-10 -bottom-10 size-56 rounded-full bg-[var(--public-accent)]/10 blur-3xl" />

            <div ref={statisticsRef} className="relative grid grid-cols-2 sm:grid-cols-4">
              {statistics.map((s, i) => {
                const Icon = resolveIcon(s.icon)
                const tone = i % 2 === 0 ? "navy" : "green"
                return (
                  <div
                    key={s.id}
                    className={`group flex flex-col items-center px-4 py-4 text-center transition-transform duration-300 hover:-translate-y-1 ${
                      i > 0 ? "sm:border-l sm:border-border" : ""
                    }`}
                  >
                    <span
                      className={`flex size-14 items-center justify-center rounded-2xl text-white shadow-md transition-shadow duration-300 group-hover:shadow-glow-primary ${
                        tone === "navy" ? "bg-gradient-brand-br" : "bg-[var(--public-accent)]"
                      }`}
                    >
                      <Icon className="size-6" />
                    </span>
                    <p
                      className={`mt-4 w-full whitespace-nowrap text-3xl font-bold tabular-nums sm:text-4xl ${
                        tone === "navy" ? "text-primary" : "text-[var(--public-accent-text)] dark:text-[var(--public-bright)]"
                      }`}
                    >
                      <span className="sr-only">{s.value}</span>
                      <span aria-hidden="true" data-stat-value={s.value}>{s.value}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground sm:text-base">{s.label}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
