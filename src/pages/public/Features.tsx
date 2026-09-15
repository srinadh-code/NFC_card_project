import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowRight,
  ArrowUpRight,
  PlayCircle,
  Star,
  MousePointerClick,
  Eye,
  ScanLine,
  BookmarkCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import CtaBanner from "@/components/marketing/CtaBanner"
import { StatWidget } from "@/components/marketing/StatWidget"
import { NfcCardFace } from "@/components/marketing/NfcCardShowcase"
import DashboardMockup from "@/components/marketing/DashboardMockup"
import ProfilePhonePreview from "@/components/marketing/ProfilePhonePreview"
import { Reveal } from "@/components/marketing/Reveal"
import { resolveIcon } from "@/lib/icon-map"
import { publicWebsiteApi } from "@/lib/contentApi"

const AVATAR_SEEDS = ["ananya-reddy", "rahul-menon", "priya-nair", "karthik-iyer"]

// Fallback only for a card that has neither an admin-uploaded image nor a
// saved gradient — keeps the grid from ever showing a blank icon badge.
const FALLBACK_GRADIENT = "linear-gradient(135deg,#4F46E5,#7C3AED)"

export default function Features() {
  const navigate = useNavigate()
  const [demoOpen, setDemoOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ["content", "public-features-page"],
    queryFn: publicWebsiteApi.getFeaturesPage,
  })
  const page = data?.page

  if (isError) {
    return (
      <div>
        <p className="py-24 text-center text-muted-foreground">
          Couldn&apos;t load this page&apos;s content. Please try again shortly.
        </p>
      </div>
    )
  }

  function handleSecondaryCta() {
    if (page?.secondary_cta_url) navigate(page.secondary_cta_url)
    else setDemoOpen(true)
  }

  return (
    <div className="overflow-x-hidden">
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden bg-background pb-24 pt-16 sm:pt-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: "radial-gradient(circle, #C4B5FD 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(ellipse 60% 60% at 70% 30%, black, transparent)",
          }}
        />
        <div className="pointer-events-none absolute right-0 top-0 size-[32rem] rounded-full bg-gradient-to-br from-[#7C3AED]/20 to-[#EC4899]/10 blur-[100px]" />

        <div className="relative container-page grid items-center gap-16 lg:grid-cols-2">
          <div>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-12 w-full max-w-md" />
                <Skeleton className="h-20 w-full max-w-lg" />
              </div>
            ) : (
              <>
                {page?.hero_badge && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm">
                    {page.hero_badge}
                  </span>
                )}
                <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl">
                  {page?.hero_heading_line1}
                  <br />
                  <span className="text-gradient-brand">{page?.hero_heading_line2}</span>
                </h1>
                <p className="mt-6 max-w-lg text-lg text-muted-foreground">{page?.hero_description}</p>
              </>
            )}

            <div className="mt-9 flex flex-wrap gap-4">
              <Button size="lg" variant="gradient" onClick={() => navigate(page?.primary_cta_url || "/shop")}>
                {page?.primary_cta_text || "Order Your Card"}
                <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" className="gap-2" onClick={handleSecondaryCta}>
                <PlayCircle className="size-4" />
                {page?.secondary_cta_text || "Watch Demo"}
              </Button>
            </div>

            {page?.trusted_users_count && (
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <div className="flex -space-x-3">
                  {AVATAR_SEEDS.map((seed) => (
                    <img
                      key={seed}
                      src={`https://api.dicebear.com/9.x/notionists/svg?seed=${seed}`}
                      alt=""
                      className="size-10 rounded-full border-2 border-white bg-secondary shadow-sm"
                    />
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="size-4 fill-[#F59E0B] text-[#F59E0B]" />
                    ))}
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    Trusted by {page.trusted_users_count} {page.trust_badge_text}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right: hero image if uploaded, else the built-in NFC card render + floating widgets */}
          <div className="relative flex items-center justify-center py-10 lg:py-0">
            <div className="pointer-events-none absolute size-96 rounded-full bg-gradient-to-br from-[#7C3AED]/20 via-[#EC4899]/15 to-transparent blur-3xl" />

            {page?.hero_image_url ? (
              <img
                src={page.hero_image_url}
                alt=""
                className="relative z-10 w-full max-w-md object-contain drop-shadow-2xl"
              />
            ) : (
              <>
                <p className="absolute left-1/2 -top-10 hidden w-max max-w-[220px] -translate-x-1/2 rotate-1 text-center font-serif text-xs italic text-muted-foreground sm:block">
                  Just a tap and you&apos;re connected!
                </p>

                <div className="relative h-[220px] w-full max-w-[360px] sm:h-[260px]">
                  <div className="absolute inset-0 translate-x-8 translate-y-4 animate-float-slower">
                    <div className="h-full w-full rotate-6">
                      <NfcCardFace tone="gold" />
                    </div>
                  </div>
                  <div className="absolute inset-0 animate-float-slow">
                    <div className="h-full w-full -rotate-6 cursor-pointer transition-transform duration-500 ease-out hover:-rotate-2 hover:scale-[1.03]">
                      <NfcCardFace tone="front" />
                    </div>
                  </div>
                </div>

                {/* Decorative example widgets — illustrative only, not admin content */}
                <StatWidget
                  icon={MousePointerClick}
                  label="Total Taps"
                  value="12,458"
                  deltaPct="24.5%"
                  iconBg="#4F46E5"
                  points={[4, 6, 5, 8, 7, 10, 9]}
                  sparkColor="#4F46E5"
                  className="absolute -right-4 top-8 hidden w-44 animate-float-slow sm:flex"
                />
                <StatWidget
                  icon={Eye}
                  label="Profile Views"
                  value="8,920"
                  deltaPct="18.6%"
                  iconBg="#7C3AED"
                  points={[5, 5, 7, 6, 8, 9, 8]}
                  sparkColor="#7C3AED"
                  className="absolute -right-8 top-40 hidden w-44 animate-float-slower sm:flex"
                />
                <StatWidget
                  icon={ScanLine}
                  label="QR Scans"
                  value="3,538"
                  deltaPct="32.7%"
                  iconBg="#EC4899"
                  points={[3, 4, 4, 6, 5, 7, 8]}
                  sparkColor="#EC4899"
                  className="absolute -left-6 bottom-6 hidden w-44 animate-float-slow sm:flex"
                />
                <StatWidget
                  icon={BookmarkCheck}
                  label="Contacts Saved"
                  value="2,450"
                  deltaPct="21.4%"
                  iconBg="#22C55E"
                  points={[2, 3, 3, 4, 5, 5, 6]}
                  sparkColor="#22C55E"
                  className="absolute -left-2 top-6 hidden w-44 animate-float-slower sm:flex"
                />
              </>
            )}
          </div>
        </div>
      </section>

      <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demo Video</DialogTitle>
            <DialogDescription>Demo video coming soon! Check back shortly.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* ============ FEATURE GRID ============ */}
      <section className="bg-secondary py-20">
        <div className="container-page">
          {isLoading ? (
            <div className="mx-auto max-w-2xl space-y-3 text-center">
              <Skeleton className="mx-auto h-8 w-72" />
              <Skeleton className="mx-auto h-5 w-96" />
            </div>
          ) : (
            (page?.features_grid_heading || page?.features_grid_subtitle) && (
              <Reveal>
                <div className="mx-auto max-w-2xl text-center">
                  <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {page.features_grid_heading}
                  </h2>
                  <p className="mt-3 text-muted-foreground">{page.features_grid_subtitle}</p>
                </div>
              </Reveal>
            )
          )}

          {isLoading ? (
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : (
            data &&
            data.cards.length > 0 && (
              <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {data.cards.map((f, i) => {
                  const Icon = resolveIcon(f.icon)
                  return (
                    <Reveal key={f.id} delayMs={i * 80}>
                      <div className="card-hover group flex items-start gap-4 rounded-[24px] border border-border/70 bg-card p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                        {f.image_url ? (
                          <img
                            src={f.image_url}
                            alt=""
                            className="size-12 shrink-0 rounded-xl object-cover shadow-md"
                          />
                        ) : (
                          <span
                            className="flex size-12 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
                            style={{ background: f.gradient || FALLBACK_GRADIENT }}
                          >
                            <Icon className="size-6" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-foreground">{f.title}</h3>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
                          {f.cta_text && f.cta_url && (
                            <button
                              onClick={() => navigate(f.cta_url)}
                              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                            >
                              {f.cta_text}
                              <ArrowUpRight className="size-3.5" />
                            </button>
                          )}
                        </div>
                        {!(f.cta_text && f.cta_url) && (
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-300 group-hover:border-primary group-hover:bg-primary group-hover:text-white">
                            <ArrowUpRight className="size-4" />
                          </span>
                        )}
                      </div>
                    </Reveal>
                  )
                })}
              </div>
            )
          )}
        </div>
      </section>

      {/* ============ ANALYTICS SHOWCASE ============ */}
      {data?.analytics && (
        <section className="bg-background py-20">
          <div className="container-page">
            <div className="relative overflow-hidden rounded-[32px] border border-border bg-card p-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:shadow-[0_20px_45px_rgba(0,0,0,0.5)] sm:p-14">
              <div className="pointer-events-none absolute -left-16 -top-16 size-72 rounded-full bg-primary/15 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 -right-16 size-72 rounded-full bg-[#EC4899]/15 blur-3xl" />

              <div className="relative grid items-center gap-12 lg:grid-cols-2">
                <Reveal>
                  {data.analytics.badge && (
                    <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-xs font-semibold tracking-wide text-primary shadow-sm">
                      {data.analytics.badge}
                    </span>
                  )}
                  <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {data.analytics.heading}
                  </h2>
                  <p className="mt-4 max-w-md text-muted-foreground">{data.analytics.description}</p>
                  {data.analytics.cta_text && (
                    <Button
                      size="lg"
                      variant="gradient"
                      className="mt-8"
                      onClick={() => navigate(data.analytics!.cta_url || "/login")}
                    >
                      {data.analytics.cta_text}
                      <ArrowRight className="size-4" />
                    </Button>
                  )}
                </Reveal>

                <Reveal variant="scale" delayMs={100}>
                  <div className="relative">
                    {data.analytics.dashboard_image_url ? (
                      <img
                        src={data.analytics.dashboard_image_url}
                        alt=""
                        className="w-full rounded-2xl object-contain shadow-2xl"
                      />
                    ) : (
                      <>
                        <DashboardMockup />
                        <ProfilePhonePreview className="absolute -bottom-10 -right-6 hidden rotate-3 animate-float-slow sm:block" />
                        <p className="absolute -bottom-14 right-32 hidden max-w-[110px] -rotate-2 text-right font-serif text-xs italic text-muted-foreground lg:block">
                          Your profile, your rules.
                        </p>
                      </>
                    )}
                  </div>
                </Reveal>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============ SHOWCASE ============ */}
      {data?.showcase && (
        <section className="bg-secondary py-20">
          <div className="container-page">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <Reveal>
                {data.showcase.badge && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
                    {data.showcase.badge}
                  </span>
                )}
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {data.showcase.heading}
                </h2>
                <p className="mt-4 text-muted-foreground">{data.showcase.description}</p>
              </Reveal>
              <Reveal variant="scale" delayMs={100}>
                <div className="relative flex items-center justify-center py-6">
                  <div className="pointer-events-none absolute size-72 rounded-full bg-gradient-to-br from-[#4F46E5]/15 via-[#7C3AED]/15 to-[#EC4899]/10 blur-3xl" />
                  {data.showcase.main_image_url && (
                    <img
                      src={data.showcase.main_image_url}
                      alt=""
                      className="relative z-10 w-full max-w-sm rounded-[24px] object-contain shadow-2xl"
                    />
                  )}
                  {data.showcase.card_image_url && (
                    <img
                      src={data.showcase.card_image_url}
                      alt=""
                      className="absolute bottom-0 right-0 z-20 w-32 rotate-6 rounded-2xl object-contain shadow-xl sm:w-40"
                    />
                  )}
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      )}

      {/* ============ STATS ============ */}
      {data && data.statistics.length > 0 && (
        <section className="relative overflow-hidden bg-gradient-brand px-4 py-14">
          <div className="pointer-events-none absolute -top-24 left-1/4 size-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-1/4 size-64 rounded-full bg-white/10 blur-3xl" />
          <div className="relative mx-auto grid max-w-5xl grid-cols-2 gap-8 sm:grid-cols-4">
            {data.statistics.map((s) => {
              const Icon = resolveIcon(s.icon)
              return (
                <div key={s.id} className="flex flex-col items-center text-center text-white">
                  <span className="flex size-10 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                    <Icon className="size-5" />
                  </span>
                  <p className="mt-3 text-2xl font-bold sm:text-3xl">{s.value}</p>
                  <p className="mt-1 text-sm text-white/80">{s.label}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {data?.cta && (
        <CtaBanner
          title={data.cta.heading}
          subtitle={data.cta.description}
          buttonLabel={data.cta.button_text}
          to={data.cta.button_url || "/shop"}
          backgroundImageUrl={data.cta.background_image_url}
        />
      )}
    </div>
  )
}
