import { useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import PageHeader from "@/components/marketing/PageHeader"
import NfcCardShowcase from "@/components/marketing/NfcCardShowcase"
import MissionShowcase from "@/components/marketing/MissionShowcase"
import StatsShowcaseCard from "@/components/marketing/StatsShowcaseCard"
import { cardClass } from "@/components/marketing/PremiumCard"
import { Skeleton } from "@/components/ui/skeleton"
import { resolveIcon } from "@/lib/icon-map"
import { publicWebsiteApi } from "@/lib/contentApi"

/** Admin uploads are stored as full-size originals (often multi-MB PNGs);
 * ask Cloudinary for a resized, auto-format/quality version instead. Other
 * URLs are returned untouched. */
function optimizedImage(url: string, width: number) {
  return url.replace(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?=v\d+\/)/,
    `$1f_auto,q_auto,c_limit,w_${width}/`,
  )
}

export default function About() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["content", "public-about"],
    queryFn: publicWebsiteApi.getAbout,
  })
  // Image URLs that failed to load (e.g. deleted from Cloudinary), so each
  // section falls back gracefully instead of rendering a broken box.
  const [failedImages, setFailedImages] = useState<string[]>([])
  const usableImage = (url?: string | null) => (url && !failedImages.includes(url) ? url : null)
  const markFailed = (url: string) => setFailedImages((prev) => [...prev, url])
  const storyImageUrl = usableImage(data?.page.story_image_url)
  const builtImageUrl = usableImage(data?.built_from_experience?.image_url)

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
            <Skeleton className="mx-auto h-10 w-full max-w-sm" />
            <Skeleton className="mx-auto h-6 w-full max-w-xl" />
          </div>
        </section>
      ) : (
        <PageHeader title={data?.page.page_title ?? ""} subtitle={data?.page.page_subtitle} />
      )}

      {/* Premium hero showcase — story left, NFC card product render right */}
      <section className="bg-background py-16 sm:py-20">
        <div className="container-page grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
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
                {/* Story copy is optional in the admin — skip empty fields so
                    they don't leave a blank heading or phantom spacing. */}
                {data?.page.story_title && (
                  <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {data.page.story_title}
                  </h2>
                )}
                {data?.page.story_paragraph_1 && (
                  <p className="mt-4 text-muted-foreground sm:text-lg">{data.page.story_paragraph_1}</p>
                )}
                {data?.page.story_paragraph_2 && (
                  <p className="mt-4 text-muted-foreground sm:text-lg">{data.page.story_paragraph_2}</p>
                )}
              </>
            )}

            {data && data.story_features.length > 0 && (
              <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.story_features.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm font-medium text-foreground sm:text-base">
                    <CheckCircle2 className="size-5 shrink-0 text-primary" />
                    {f.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            {/* Admin-managed hero-style image (Website Content → About →
                Page Header & Story) — falls back to the built-in NFC card
                showcase graphic when no image has been uploaded or it fails
                to load. */}
            {isLoading ? (
              <Skeleton className="mx-auto aspect-[4/3] w-full max-w-md rounded-[32px] sm:max-w-lg" />
            ) : storyImageUrl ? (
              <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-[32px] shadow-[0_20px_60px_rgba(15,23,42,0.12)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)] sm:max-w-lg">
                <img
                  src={optimizedImage(storyImageUrl, 1200)}
                  alt="VR's GATEWAY — our story"
                  className="size-full object-cover"
                  decoding="async"
                  onError={() => markFailed(storyImageUrl)}
                />
              </div>
            ) : (
              <NfcCardShowcase />
            )}
          </div>
        </div>
      </section>

      {/* Our Mission — premium hero card */}
      {isLoading ? (
        <section className="bg-background pb-6 sm:pb-8">
          <div className="container-page">
            <Skeleton className="h-64 w-full rounded-[32px]" />
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
        <section className="bg-background">
          <div className="container-page">
            <Skeleton className="h-40 w-full rounded-[32px]" />
          </div>
        </section>
      ) : (
        data && <StatsShowcaseCard statistics={data.statistics} />
      )}

      {/* Why Choose VR's GATEWAY — skeleton reserves the space while loading
          so the sections below don't jump when the cards arrive. */}
      {isLoading && (
        <section className="bg-background py-16 sm:py-20">
          <div className="container-page">
            <div className="mx-auto max-w-2xl space-y-3 text-center">
              <Skeleton className="mx-auto h-9 w-full max-w-sm" />
              <Skeleton className="mx-auto h-5 w-full max-w-md" />
            </div>
            <div className="centered-card-grid mt-12">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-52 w-full rounded-[24px]" />
              ))}
            </div>
          </div>
        </section>
      )}
      {data && data.why_choose.length > 0 && (
        <section className="bg-background py-16 sm:py-20">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Why Choose VR's GATEWAY?</h2>
              <p className="mt-3 text-muted-foreground sm:text-lg">
                Everything you need to network smarter, in one premium card.
              </p>
            </div>
            <div className="centered-card-grid mt-12">
              {data.why_choose.map((f) => {
                const Icon = resolveIcon(f.icon)
                return (
                  <div
                    key={f.id}
                    className="card-hover rounded-[24px] border border-[#8B5CF6]/20 bg-card p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                  >
                    {/* gradient is optional in the admin — fall back to the brand
                        gradient so the white icon never sits on a blank tile. */}
                    <span
                      className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F46E5] via-[#7C3AED] to-[#EC4899] text-white shadow-md"
                      style={f.gradient ? { background: f.gradient } : undefined}
                    >
                      <Icon className="size-6" />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-foreground">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{f.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Built From Experience + Values */}
      <section className="bg-secondary py-16 sm:py-20">
        <div className="container-page">
          {isLoading ? (
            <div className="mx-auto max-w-2xl space-y-3 text-center">
              <Skeleton className="mx-auto h-8 w-full max-w-xs" />
              <Skeleton className="mx-auto h-5 w-full max-w-md" />
            </div>
          ) : (
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {data?.built_from_experience?.heading ?? "Built From Experience"}
              </h2>
              <p className="mt-3 text-muted-foreground sm:text-lg">{data?.built_from_experience?.subtitle}</p>
            </div>
          )}
          {/* Admin-managed image (Website Content → About → Built From
              Experience). Without a usable one the copy is shown on its own,
              centered, rather than exposing an upload hint to visitors. */}
          <div
            className={
              isLoading || builtImageUrl
                ? "mt-12 grid gap-10 lg:grid-cols-2 lg:gap-12"
                : "mx-auto mt-8 max-w-2xl text-center"
            }
          >
            {/* Image pins to the top of the row and stays in view beside long
                copy (top-28 clears the sticky navbar); short copy is shorter
                than the image, so the text column's self-center centers it. */}
            {(isLoading || builtImageUrl) && (
              <div className="relative flex items-center justify-center lg:sticky lg:top-28 lg:justify-end lg:self-start">
                <div className="absolute size-64 rounded-full bg-gradient-to-br from-[#4F46E5]/10 via-[#7C3AED]/10 to-[#EC4899]/10 blur-3xl" />
                {builtImageUrl ? (
                  <div className="relative z-10 aspect-[4/3] w-full max-w-xl overflow-hidden rounded-[24px] shadow-[0_20px_60px_rgba(15,23,42,0.12)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                    <img
                      src={optimizedImage(builtImageUrl, 1200)}
                      alt="VR's GATEWAY story"
                      className="size-full object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={() => markFailed(builtImageUrl)}
                    />
                  </div>
                ) : (
                  <Skeleton className="relative z-10 aspect-[4/3] w-full max-w-xl rounded-[24px]" />
                )}
              </div>
            )}
            {/* Readable measure that matches the image width when stacked;
                long copy simply grows the row. */}
            <div className="mx-auto w-full max-w-xl space-y-4 lg:mx-0 lg:self-center">
              {isLoading ? (
                <>
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-2/3" />
                </>
              ) : (
                [data?.built_from_experience?.paragraph_1, data?.built_from_experience?.paragraph_2]
                  .filter(Boolean)
                  .map((text, i) => (
                    <p key={i} className="leading-relaxed text-muted-foreground sm:text-lg">
                      {text}
                    </p>
                  ))
              )}
            </div>
          </div>
          {isLoading ? (
            <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : (
            data && data.values.length > 0 && (
              <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {data.values.map((v) => {
                  const Icon = resolveIcon(v.icon)
                  return (
                    <div key={v.id} className={`${cardClass} p-6 text-center`}>
                      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F46E5] via-[#7C3AED] to-[#EC4899] text-white shadow-md">
                        <Icon className="size-6" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-foreground">{v.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{v.description}</p>
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
