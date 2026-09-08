import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  CheckCircle2,
  ArrowRight,
  MessageCircle,
  PlayCircle,
  Star,
  Wifi,
  Briefcase,
  Camera,
  AtSign,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Skeleton } from "@/components/ui/skeleton"
import { useState } from "react"
import heroImg from "@/assets/hero.png"
import StatCounter from "@/components/marketing/StatCounter"
import FeatureCard from "@/components/marketing/FeatureCard"
import CtaBanner from "@/components/marketing/CtaBanner"
import NfcShowcase from "@/components/marketing/NfcShowcase"
import TestimonialCard from "@/components/marketing/TestimonialCard"
import { cardClass } from "@/components/marketing/PremiumCard"
import { cn } from "@/lib/utils"
import { resolveIcon } from "@/lib/icon-map"
import { publicWebsiteApi } from "@/lib/contentApi"
import type { Testimonial as PublicTestimonial } from "@/types/content"
import type { Testimonial } from "@/types"

const AVATAR_SEEDS = ["ananya-reddy", "rahul-menon", "priya-nair", "karthik-iyer"]
const HERO_PROFILE_AVATAR = "https://api.dicebear.com/9.x/notionists/svg?seed=alex-morgan"

function toTestimonial(t: PublicTestimonial): Testimonial {
  return {
    id: String(t.id),
    name: t.name,
    role: t.designation,
    company: t.company,
    avatar: t.image_url || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(t.name)}`,
    rating: t.rating,
    quote: t.review,
  }
}

function ErrorMessage() {
  return (
    <p className="py-16 text-center text-muted-foreground">
      Couldn&apos;t load this page&apos;s content. Please try again shortly.
    </p>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const [demoOpen, setDemoOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ["content", "public-home"],
    queryFn: publicWebsiteApi.getHome,
  })
  const { data: features } = useQuery({
    queryKey: ["content", "public-features"],
    queryFn: publicWebsiteApi.getFeatures,
  })

  const hero = data?.hero ?? null

  if (isError) {
    return (
      <div>
        <ErrorMessage />
      </div>
    )
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-white pb-20 pt-16 sm:pt-20">
        <div className="container-page grid items-center gap-12 lg:grid-cols-2">
          <div>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-12 w-full max-w-md" />
                <Skeleton className="h-20 w-full max-w-lg" />
              </div>
            ) : (
              <>
                {hero?.badge && (
                  <span className="inline-flex items-center rounded-full bg-[#4F46E5]/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#4F46E5]">
                    {hero.badge}
                  </span>
                )}
                <h1 className="mt-5 bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#EC4899] bg-clip-text text-4xl font-bold leading-tight tracking-tight text-transparent sm:text-5xl md:text-6xl">
                  {hero?.heading}
                </h1>
                <p className="mt-6 max-w-lg text-lg text-muted-foreground">{hero?.description}</p>
              </>
            )}
            {data && data.hero_features.length > 0 && (
              <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.hero_features.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CheckCircle2 className="size-5 shrink-0 text-[#4F46E5]" />
                    {item.label}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-10 flex flex-wrap gap-4">
              <Button
                size="lg"
                variant="gradient"
                onClick={() => navigate(hero?.primary_cta_link || "/shop")}
              >
                {hero?.primary_cta_text || "Order Your Card"}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2 border-[#4F46E5] text-[#4F46E5] transition-all duration-300 hover:bg-[#4F46E5]/5"
                onClick={() => {
                  if (hero?.secondary_cta_link) navigate(hero.secondary_cta_link)
                  else setDemoOpen(true)
                }}
              >
                <PlayCircle className="size-4" />
                {hero?.secondary_cta_text || "Watch Demo"}
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <div className="flex -space-x-3">
                {AVATAR_SEEDS.map((seed) => (
                  <img
                    key={seed}
                    src={`https://api.dicebear.com/9.x/notionists/svg?seed=${seed}`}
                    alt=""
                    className="size-10 rounded-full border-2 border-white bg-[#F8FAFC] shadow-sm"
                  />
                ))}
              </div>
              <div>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-4 fill-[#F59E0B] text-[#F59E0B]" />
                  ))}
                </div>
                <p className="text-sm font-medium text-foreground">10,000+ Happy Users</p>
              </div>
            </div>
          </div>

          <div className="relative flex items-center justify-center py-10">
            <div className="absolute size-80 rounded-full bg-gradient-to-br from-[#4F46E5]/25 via-[#7C3AED]/25 to-[#EC4899]/25 blur-3xl sm:size-96" />

            {/* NFC card, tilted behind the phone */}
            <div className="absolute left-1/2 top-1/2 z-0 h-52 w-80 -translate-x-[62%] -translate-y-1/2 -rotate-6 animate-float-slower rounded-[24px] bg-gradient-to-br from-[#0F172A] to-[#1E293B] p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold tracking-tight text-white">VR's NEXORA</span>
                <Wifi className="size-5 rotate-90 text-white/70" />
              </div>
              <p className="mt-16 text-lg font-semibold tracking-tight text-white/90">VR's NEXORA</p>
            </div>

            {/* Phone mockup */}
            <div className="relative z-10 flex h-[420px] w-[220px] items-center justify-center rounded-[2.5rem] border-[6px] border-[#0F172A] bg-[#0F172A] shadow-2xl sm:h-[460px] sm:w-[230px]">
              <span className="absolute left-1/2 top-2.5 h-1.5 w-16 -translate-x-1/2 rounded-full bg-white/20" />
              <div className="flex h-full w-full flex-col items-center gap-3 overflow-hidden rounded-[2rem] bg-gradient-brand-br px-5 pb-6 pt-10 text-center">
                <img
                  src={HERO_PROFILE_AVATAR}
                  alt="Alex Morgan"
                  className="size-16 rounded-full border-2 border-white/70 object-cover"
                />
                <div>
                  <p className="text-sm font-bold text-white">Alex Morgan</p>
                  <p className="text-xs text-white/75">Product Designer</p>
                  <p className="text-[11px] text-white/60">VR's NEXORA</p>
                </div>
                <div className="flex items-center gap-2">
                  {[Briefcase, Camera, AtSign, MessageCircle].map((Icon, i) => (
                    <span key={i} className="flex size-6 items-center justify-center rounded-full bg-white/15 text-white">
                      <Icon className="size-3.5" />
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex w-full flex-col gap-2">
                  <span className="rounded-xl bg-white/95 py-2 text-xs font-semibold text-[#4F46E5] shadow-sm">
                    Save Contact
                  </span>
                  <span className="rounded-xl border border-white/40 py-2 text-xs font-semibold text-white">
                    Share Profile
                  </span>
                </div>
              </div>
            </div>

            {/* Floating analytics widgets */}
            <div className="absolute -left-2 top-4 z-20 hidden animate-float-slow rounded-2xl border border-border/70 bg-white p-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.12)] sm:block">
              <p className="text-[11px] font-medium text-muted-foreground">Total Taps</p>
              <p className="text-lg font-bold text-foreground">12,458</p>
              <p className="flex items-center gap-0.5 text-[11px] font-semibold text-[#22C55E]">
                <TrendingUp className="size-3" /> 24.5%
              </p>
            </div>
            <div className="absolute -right-2 top-1/3 z-20 hidden animate-float-slower rounded-2xl border border-border/70 bg-white p-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.12)] sm:block">
              <p className="text-[11px] font-medium text-muted-foreground">Profile Views</p>
              <p className="text-lg font-bold text-foreground">8,920</p>
              <p className="flex items-center gap-0.5 text-[11px] font-semibold text-[#22C55E]">
                <TrendingUp className="size-3" /> 18.6%
              </p>
            </div>
            <div className="absolute -left-4 bottom-6 z-20 hidden animate-float-slow rounded-2xl border border-border/70 bg-white p-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.12)] sm:block">
              <p className="text-[11px] font-medium text-muted-foreground">QR Scans</p>
              <p className="text-lg font-bold text-foreground">3,538</p>
              <p className="flex items-center gap-0.5 text-[11px] font-semibold text-[#22C55E]">
                <TrendingUp className="size-3" /> 32.7%
              </p>
            </div>
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

      {/* NFC Showcase */}
      {isLoading ? (
        <section className="bg-white py-20">
          <div className="container-page space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-24 w-full max-w-lg" />
          </div>
        </section>
      ) : (
        data?.how_it_feels && (
          <NfcShowcase
            badge={data.how_it_feels.badge}
            heading={data.how_it_feels.heading}
            description={data.how_it_feels.description}
            points={data.how_it_feels.points}
          />
        )
      )}

      {/* Trusted by */}
      {isLoading ? (
        <section className="border-y border-[#E2E8F0] bg-[#F8FAFC] py-10">
          <div className="container-page">
            <Skeleton className="mx-auto h-4 w-48" />
          </div>
        </section>
      ) : (
        data && data.companies.length > 0 && (
          <section className="border-y border-[#E2E8F0] bg-[#F8FAFC] py-10">
            <div className="container-page">
              <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Trusted by professionals at
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
                {data.companies.map((brand) =>
                  brand.logo_url ? (
                    <img
                      key={brand.id}
                      src={brand.logo_url}
                      alt={brand.name}
                      className="h-6 w-auto object-contain opacity-60"
                    />
                  ) : (
                    <span key={brand.id} className="text-xl font-bold text-muted-foreground/50">
                      {brand.name}
                    </span>
                  ),
                )}
              </div>
            </div>
          </section>
        )
      )}

      {/* Stats */}
      {isLoading ? (
        <section className="bg-white px-4 py-16">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </section>
      ) : (
        data && data.statistics.length > 0 && (
          <section className="bg-white px-4 py-16">
            <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 sm:grid-cols-4">
              {data.statistics.map((s) => (
                <StatCounter key={s.id} value={s.value} label={s.label} />
              ))}
            </div>
          </section>
        )
      )}

      {/* Our Story */}
      <section className="bg-[#F8FAFC] py-20">
        <div className="container-page">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">Our Story</h2>
              <p className="mt-4 text-muted-foreground">
                VR's NEXORA was born from a simple frustration — running out of paper business cards
                at the exact moment a great connection was made. We set out to build a smarter,
                greener, and more memorable way to network.
              </p>
              <p className="mt-4 text-muted-foreground">
                Today, thousands of professionals across the globe use VR's NEXORA to share their
                identity in an instant, track every interaction, and keep their profile fresh
                without ever reprinting a card.
              </p>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="absolute size-72 rounded-full bg-gradient-to-br from-[#4F46E5]/10 via-[#7C3AED]/10 to-[#EC4899]/10 blur-3xl" />
              <img src={heroImg} alt="VR's NEXORA story" className="relative z-10 w-full max-w-sm" />
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

      {/* Why choose */}
      {features && features.length > 0 && (
        <section className="bg-white py-20">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">Why Choose VR's NEXORA?</h2>
              <p className="mt-3 text-muted-foreground">
                Everything you need to network smarter, in one tiny card.
              </p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.slice(0, 4).map((f) => (
                <FeatureCard key={f.id} icon={resolveIcon(f.icon)} title={f.title} description={f.description} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Testimonials */}
      {isLoading ? (
        <section className="bg-[#F8FAFC] py-20">
          <div className="container-page grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full" />
            ))}
          </div>
        </section>
      ) : (
        data && data.testimonials.length > 0 && (
          <section className="bg-[#F8FAFC] py-20">
            <div className="container-page">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-3xl font-bold tracking-tight text-foreground">
                  Loved by Professionals Everywhere
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Real stories from people who upgraded the way they network.
                </p>
              </div>
              <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {data.testimonials.map((t) => (
                  <TestimonialCard key={t.id} testimonial={toTestimonial(t)} />
                ))}
              </div>
            </div>
          </section>
        )
      )}

      {/* FAQ preview */}
      {isLoading ? (
        <section className="bg-white px-4 py-20">
          <div className="mx-auto max-w-3xl space-y-3">
            <Skeleton className="mx-auto h-8 w-72" />
            <Skeleton className="h-64 w-full" />
          </div>
        </section>
      ) : (
        data && data.faqs_preview.length > 0 && (
          <section className="bg-white px-4 py-20">
            <div className="mx-auto max-w-3xl">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-3xl font-bold tracking-tight text-foreground">
                  Frequently Asked Questions
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Quick answers to the questions we hear most often.
                </p>
              </div>
              <Accordion
                type="single"
                collapsible
                className={cn(cardClass, "mt-10 px-6 hover:translate-y-0 hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)]")}
              >
                {data.faqs_preview.map((faq) => (
                  <AccordionItem key={faq.id} value={`item-${faq.id}`} className="border-[#E2E8F0]">
                    <AccordionTrigger className="text-base hover:no-underline">{faq.question}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              <div className="mt-8 text-center">
                <Button
                  variant="ghost"
                  className="text-[#4F46E5] hover:bg-[#4F46E5]/5 hover:text-[#4F46E5]"
                  onClick={() => navigate("/faq")}
                >
                  View all FAQs
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </section>
        )
      )}

      {/* Contact CTA */}
      {data?.cta && (
        <section className="bg-[#F8FAFC] px-4 py-20">
          <div className="mx-auto max-w-4xl">
            <div className="relative overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white p-10 text-center shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:p-14">
              <div className="pointer-events-none absolute -left-16 -top-16 size-56 rounded-full bg-[#4F46E5]/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 -right-16 size-56 rounded-full bg-[#EC4899]/10 blur-3xl" />
              <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4F46E5] via-[#7C3AED] to-[#EC4899] text-white shadow-[0_4px_14px_rgba(79,70,229,0.4)]">
                <MessageCircle className="size-7" />
              </div>
              <h2 className="relative mt-6 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {data.cta.heading}
              </h2>
              <p className="relative mx-auto mt-3 max-w-lg text-muted-foreground">{data.cta.description}</p>
              <Button
                size="lg"
                className="relative mt-8 rounded-xl bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#EC4899] text-white shadow-[0_10px_30px_rgba(79,70,229,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_15px_35px_rgba(79,70,229,0.45)]"
                onClick={() => navigate(data.cta?.button_link || "/contact")}
              >
                {data.cta.button_text}
              </Button>
            </div>
          </div>
        </section>
      )}

      <CtaBanner title="Ready to Experience the Power of VR's NEXORA?" />
    </div>
  )
}
