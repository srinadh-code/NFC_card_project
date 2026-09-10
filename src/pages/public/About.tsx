import { CheckCircle2, ChevronRight } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import heroImg from "@/assets/hero.png"
import PageHeader from "@/components/marketing/PageHeader"
import NfcCardShowcase from "@/components/marketing/NfcCardShowcase"
import MissionShowcase from "@/components/marketing/MissionShowcase"
import StatsShowcaseCard from "@/components/marketing/StatsShowcaseCard"
import { cardClass } from "@/components/marketing/PremiumCard"
import { Skeleton } from "@/components/ui/skeleton"
import { resolveIcon } from "@/lib/icon-map"
import { publicWebsiteApi } from "@/lib/contentApi"

export default function About() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["content", "public-about"],
    queryFn: publicWebsiteApi.getAbout,
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
      {isLoading ? (
        <section className="border-b border-border bg-gradient-to-b from-primary/5 to-background px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-4xl space-y-4 text-center">
            <Skeleton className="mx-auto h-10 w-96" />
            <Skeleton className="mx-auto h-6 w-full max-w-xl" />
          </div>
        </section>
      ) : (
        <PageHeader title={data?.page.page_title ?? ""} subtitle={data?.page.page_subtitle} />
      )}

      {/* Premium hero showcase — story left, NFC card product render right */}
      <section className="bg-background py-16 sm:py-20">
        <div className="container-page grid items-center gap-12 lg:grid-cols-2">
          <div>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-12 w-full max-w-md" />
                <Skeleton className="h-20 w-full max-w-lg" />
              </div>
            ) : (
              <>
                {data?.page.story_badge && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
                    {data.page.story_badge}
                  </span>
                )}
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {data?.page.story_title}
                </h2>
                <p className="mt-4 text-muted-foreground">{data?.page.story_paragraph_1}</p>
                <p className="mt-4 text-muted-foreground">{data?.page.story_paragraph_2}</p>
              </>
            )}

            {data && data.story_features.length > 0 && (
              <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.story_features.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CheckCircle2 className="size-5 shrink-0 text-primary" />
                    {f.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <NfcCardShowcase />
          </div>
        </div>
      </section>

      {/* Our Mission — premium hero card */}
      {isLoading ? (
        <section className="bg-background px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl space-y-4">
            <Skeleton className="h-64 w-full" />
          </div>
        </section>
      ) : (
        data?.mission && (
          <MissionShowcase
            badge={data.mission.badge}
            heading={data.mission.heading}
            description={data.mission.description}
          />
        )
      )}

      {/* Statistics showcase */}
      {isLoading ? (
        <section className="bg-background px-4 py-4 sm:py-8">
          <div className="mx-auto max-w-6xl">
            <Skeleton className="h-40 w-full" />
          </div>
        </section>
      ) : (
        data && <StatsShowcaseCard statistics={data.statistics} />
      )}

      {/* Why Choose VR's NEXORA */}
      {data && data.why_choose.length > 0 && (
        <section className="bg-background py-20">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">Why Choose VR's NEXORA?</h2>
              <p className="mt-3 text-muted-foreground">
                Everything you need to network smarter, in one premium card.
              </p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {data.why_choose.map((f) => {
                const Icon = resolveIcon(f.icon)
                return (
                  <div
                    key={f.id}
                    className="card-hover group relative rounded-[24px] border border-[#8B5CF6]/20 bg-card p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                  >
                    <span
                      className="flex size-12 items-center justify-center rounded-xl text-white shadow-md"
                      style={{ background: f.gradient }}
                    >
                      <Icon className="size-6" />
                    </span>
                    <span className="absolute right-5 top-5 flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-300 group-hover:border-primary group-hover:bg-primary group-hover:text-white">
                      <ChevronRight className="size-4" />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-foreground">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Built From Experience + Values */}
      <section className="bg-secondary py-20">
        <div className="container-page">
          {isLoading ? (
            <div className="mx-auto max-w-2xl space-y-3 text-center">
              <Skeleton className="mx-auto h-8 w-72" />
              <Skeleton className="mx-auto h-5 w-96" />
            </div>
          ) : (
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                {data?.built_from_experience?.heading ?? "Built From Experience"}
              </h2>
              <p className="mt-3 text-muted-foreground">{data?.built_from_experience?.subtitle}</p>
            </div>
          )}
          <div className="mt-12 grid items-center gap-12 lg:grid-cols-2">
            <div className="relative flex items-center justify-center">
              <div className="absolute size-64 rounded-full bg-gradient-to-br from-[#4F46E5]/10 via-[#7C3AED]/10 to-[#EC4899]/10 blur-3xl" />
              <img
                src={data?.built_from_experience?.image_url || heroImg}
                alt="VR's NEXORA story"
                className="relative z-10 mx-auto w-full max-w-sm"
              />
            </div>
            <div>
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-2/3" />
                </div>
              ) : (
                <>
                  <p className="text-muted-foreground">{data?.built_from_experience?.paragraph_1}</p>
                  <p className="mt-4 text-muted-foreground">{data?.built_from_experience?.paragraph_2}</p>
                </>
              )}
            </div>
          </div>
          {isLoading ? (
            <div className="mt-16 grid grid-cols-2 gap-6 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : (
            data && data.values.length > 0 && (
              <div className="mt-16 grid grid-cols-2 gap-6 lg:grid-cols-4">
                {data.values.map((v) => {
                  const Icon = resolveIcon(v.icon)
                  return (
                    <div key={v.id} className={`${cardClass} p-6 text-center`}>
                      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F46E5] via-[#7C3AED] to-[#EC4899] text-white shadow-md">
                        <Icon className="size-6" />
                      </div>
                      <h3 className="mt-3 font-semibold text-foreground">{v.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{v.description}</p>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      </section>
    </div>
  )
}
