import { useQuery } from "@tanstack/react-query"
import PageHeader from "@/components/marketing/PageHeader"
import CtaBanner from "@/components/marketing/CtaBanner"
import { Skeleton } from "@/components/ui/skeleton"
import { resolveIcon } from "@/lib/icon-map"
import { publicWebsiteApi } from "@/lib/contentApi"
import { useStaggeredEntrance } from "@/hooks/use-staggered-entrance"

// The backend `HowItWorksStep` model has no gradient-stop fields; cycle
// through the public navy and green brand tokens for the step cards.
const GRADIENT_PALETTE = [
  { from: "var(--brand-1)", to: "var(--brand-2)" },
  { from: "var(--brand-2)", to: "var(--public-accent)" },
  { from: "var(--brand-1)", to: "var(--public-accent)" },
  { from: "var(--public-accent)", to: "var(--brand-2)" },
  { from: "var(--brand-2)", to: "var(--brand-1)" },
]

export default function HowItWorks() {
  const { data: steps, isLoading, isError } = useQuery({
    queryKey: ["content", "public-how-it-works"],
    queryFn: publicWebsiteApi.getHowItWorks,
  })

  const stepsRef = useStaggeredEntrance({
    selector: "[data-how-it-works-step]",
    staggerMs: 200,
    content: steps,
    enabled: !isLoading && !isError,
  })

  if (isError) {
    return (
      <div>
        <p className="py-24 text-center text-muted-foreground">
          Couldn&apos;t load this page&apos;s content. Please try again shortly.
        </p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="How VR's GATEWAY Works"
        subtitle="Get from unboxing to your first tap in five simple steps."
        className="py-10 sm:py-12 lg:py-14"
      />

      <section className="bg-background py-10 sm:py-12 lg:py-14">
        <div className="container-page">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-52 w-full rounded-[24px]" />
              ))}
            </div>
          ) : (
            steps &&
            steps.length > 0 && (
              <div ref={stepsRef} className="relative grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
                <div className="pointer-events-none absolute inset-x-0 top-14 hidden h-0.5 bg-gradient-brand opacity-20 lg:block" />
                {steps.map((step, i) => {
                  const Icon = resolveIcon(step.icon)
                  const { from, to } = GRADIENT_PALETTE[i % GRADIENT_PALETTE.length]
                  return (
                    <div
                      key={step.id}
                      data-how-it-works-step
                      className="card-hover relative flex flex-col items-center rounded-[24px] p-6 text-center text-white shadow-[0_10px_30px_rgba(15,23,42,0.12)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                      style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}
                    >
                      <span className="absolute -top-3 flex size-7 items-center justify-center rounded-full bg-card text-xs font-bold text-foreground shadow">
                        {step.step_number}
                      </span>
                      <div className="mt-2 flex size-14 items-center justify-center rounded-2xl bg-white/20">
                        <Icon className="size-7" />
                      </div>
                      <h3 className="mt-4 font-semibold">{step.title}</h3>
                      <p className="mt-2 text-sm text-white/85">{step.description}</p>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      </section>

      <CtaBanner title="Ready to get your VR's GATEWAY Card?" buttonLabel="Order Now" className="py-12 sm:py-14" />
    </div>
  )
}
