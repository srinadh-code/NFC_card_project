import { Sparkles, Feather, ShieldCheck, Trophy } from "lucide-react"
import heroImg from "@/assets/hero.png"
import PageHeader from "@/components/marketing/PageHeader"
import StatCounter from "@/components/marketing/StatCounter"
import { cardClass } from "@/components/marketing/PremiumCard"

const STATS = [
  { value: "10K+", label: "Happy Customers" },
  { value: "50K+", label: "Cards Delivered" },
  { value: "1M+", label: "Taps Recorded" },
  { value: "120+", label: "Countries Served" },
]

const VALUES = [
  { icon: Sparkles, title: "Innovation", description: "Constantly evolving networking technology." },
  { icon: Feather, title: "Simplicity", description: "Effortless setup, effortless sharing." },
  { icon: ShieldCheck, title: "Trust", description: "Your data protected at every step." },
  { icon: Trophy, title: "Excellence", description: "Premium materials, premium experience." },
]

export default function About() {
  return (
    <div>
      <PageHeader
        title="About TapLink"
        subtitle="We're on a mission to replace paper business cards with a smarter, greener, more memorable way to connect."
      />

      <section className="bg-white px-4 py-16">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-muted-foreground">
              TapLink is a digital business card platform built for the modern professional.
              Instead of printing hundreds of cards that end up in a drawer, our NFC-enabled cards
              let you share a rich, always up-to-date profile with a single tap — no app required
              on the recipient's end.
            </p>
            <p className="mt-4 text-muted-foreground">
              Founded by a small team of designers and engineers who were tired of running out of
              paper cards at networking events, TapLink has grown into a platform trusted by
              individuals, startups, and enterprise teams across the globe to make every
              introduction count.
            </p>
          </div>
          <div className="relative flex items-center justify-center">
            <div className="absolute size-64 rounded-full bg-gradient-to-br from-[#4F46E5]/10 via-[#7C3AED]/10 to-[#EC4899]/10 blur-3xl" />
            <img src={heroImg} alt="About TapLink" className="relative z-10 mx-auto w-full max-w-sm" />
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-4xl rounded-[24px] border border-[#E2E8F0] bg-gradient-to-br from-[#4F46E5]/5 via-[#7C3AED]/5 to-[#EC4899]/5 p-8 text-center">
          <h2 className="text-xl font-semibold text-foreground">Our Mission</h2>
          <p className="mt-3 text-muted-foreground">
            To empower every professional with a networking tool that's instant, sustainable, and
            endlessly customizable — turning every handshake into a lasting digital connection.
          </p>
        </div>
      </section>

      <section className="bg-[#F8FAFC] px-4 py-16">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 sm:grid-cols-4">
          {STATS.map((s) => (
            <StatCounter key={s.label} value={s.value} label={s.label} />
          ))}
        </div>
      </section>

      <section className="bg-white px-4 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Our Story</h2>
            <p className="mt-3 text-muted-foreground">
              From a frustrating networking event to a platform used in 120+ countries.
            </p>
          </div>
          <div className="mt-12 grid items-center gap-12 lg:grid-cols-2">
            <div className="relative flex items-center justify-center">
              <div className="absolute size-64 rounded-full bg-gradient-to-br from-[#4F46E5]/10 via-[#7C3AED]/10 to-[#EC4899]/10 blur-3xl" />
              <img src={heroImg} alt="TapLink story" className="relative z-10 mx-auto w-full max-w-sm" />
            </div>
            <div>
              <p className="text-muted-foreground">
                It started with a simple frustration — running out of paper cards at the exact
                moment a great connection was made. We asked ourselves: why hasn't the business
                card evolved in over a century?
              </p>
              <p className="mt-4 text-muted-foreground">
                So we built TapLink: a durable NFC card paired with a beautiful, editable digital
                profile. Update your details anytime, track every tap and scan, and never run out
                of cards again.
              </p>
            </div>
          </div>
          <div className="mt-16 grid grid-cols-2 gap-6 lg:grid-cols-4">
            {VALUES.map((v) => (
              <div key={v.title} className={`${cardClass} p-6 text-center`}>
                <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F46E5] via-[#7C3AED] to-[#EC4899] text-white shadow-md">
                  <v.icon className="size-6" />
                </div>
                <h3 className="mt-3 font-semibold text-foreground">{v.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{v.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
