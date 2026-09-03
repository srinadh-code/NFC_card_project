import {
  Sparkles,
  Feather,
  ShieldCheck,
  Trophy,
  CheckCircle2,
  Nfc,
  QrCode,
  RefreshCw,
  Smartphone,
  Lock,
  Zap,
  Award,
  BarChart3,
  Radio,
} from "lucide-react"
import heroImg from "@/assets/hero.png"
import PageHeader from "@/components/marketing/PageHeader"
import StatCounter from "@/components/marketing/StatCounter"
import NfcCardShowcase from "@/components/marketing/NfcCardShowcase"
import { cardClass } from "@/components/marketing/PremiumCard"

const STATS = [
  { value: "10,000+", label: "Connections Shared" },
  { value: "5,000+", label: "Active Users" },
  { value: "99.9%", label: "Uptime" },
  { value: "100%", label: "Eco-Friendly" },
]

const FEATURE_HIGHLIGHTS = [
  { icon: Zap, label: "One Tap Sharing" },
  { icon: Nfc, label: "NFC Technology" },
  { icon: QrCode, label: "QR Code Backup" },
  { icon: RefreshCw, label: "Real-Time Updates" },
  { icon: Smartphone, label: "No App Required" },
  { icon: Lock, label: "Secure Digital Identity" },
]

const WHY_CHOOSE = [
  { icon: Zap, title: "Instant Sharing", description: "Share your full profile in under a second with a single tap — no fumbling, no typing." },
  { icon: Award, title: "Professional Branding", description: "A polished, always-current digital presence that makes every introduction count." },
  { icon: BarChart3, title: "Analytics Tracking", description: "See every tap, scan, and profile view so you know what's working." },
  { icon: Radio, title: "Contactless Networking", description: "Hygienic, effortless connections — hold your card near any phone to share instantly." },
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

      {/* Premium hero showcase — story left, NFC card product render right */}
      <section className="bg-white px-4 py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center rounded-full bg-[#4F46E5]/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#4F46E5]">
              OUR STORY
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              A smarter way to <span className="text-gradient-brand">introduce yourself</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
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

            <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FEATURE_HIGHLIGHTS.map((f) => (
                <li key={f.label} className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CheckCircle2 className="size-5 shrink-0 text-[#4F46E5]" />
                  {f.label}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <NfcCardShowcase />
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

      {/* Stats */}
      <section className="bg-[#F8FAFC] px-4 py-16">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 sm:grid-cols-4">
          {STATS.map((s) => (
            <StatCounter key={s.label} value={s.value} label={s.label} />
          ))}
        </div>
      </section>

      {/* Why Choose TapLink */}
      <section className="bg-white px-4 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Why Choose TapLink?</h2>
            <p className="mt-3 text-muted-foreground">
              Everything you need to network smarter, in one premium card.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_CHOOSE.map((f) => (
              <div key={f.title} className={`${cardClass} p-6`}>
                <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow-primary">
                  <f.icon className="size-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Story + Values */}
      <section className="bg-[#F8FAFC] px-4 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Built From Experience</h2>
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
              <div key={v.title} className={`${cardClass} bg-white p-6 text-center`}>
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
