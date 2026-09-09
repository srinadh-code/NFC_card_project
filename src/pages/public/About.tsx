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
  UserCog,
  BarChart3,
  ChevronRight,
} from "lucide-react"
import heroImg from "@/assets/hero.png"
import PageHeader from "@/components/marketing/PageHeader"
import NfcCardShowcase from "@/components/marketing/NfcCardShowcase"
import MissionShowcase from "@/components/marketing/MissionShowcase"
import StatsShowcaseCard from "@/components/marketing/StatsShowcaseCard"
import { cardClass } from "@/components/marketing/PremiumCard"

const FEATURE_HIGHLIGHTS = [
  { icon: Zap, label: "One Tap Sharing" },
  { icon: Nfc, label: "NFC Technology" },
  { icon: QrCode, label: "QR Code Backup" },
  { icon: RefreshCw, label: "Real-Time Updates" },
  { icon: Smartphone, label: "No App Required" },
  { icon: Lock, label: "Secure Digital Identity" },
]

const WHY_CHOOSE = [
  { icon: Zap, title: "Instant Sharing", description: "Share your entire profile instantly with a single tap.", bg: "linear-gradient(135deg,#4F46E5,#7C3AED)" },
  { icon: UserCog, title: "Custom Profiles", description: "Fully personalize your bio, photo, branding, and layout.", bg: "linear-gradient(135deg,#EC4899,#F472B6)" },
  { icon: Nfc, title: "NFC & QR Code", description: "Every card works via NFC tap and a printed QR code.", bg: "linear-gradient(135deg,#2563EB,#06B6D4)" },
  { icon: BarChart3, title: "Real-time Analytics", description: "See exactly who's viewing your profile, when, and from where.", bg: "linear-gradient(135deg,#22C55E,#10B981)" },
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
        title="About VR's NEXORA"
        subtitle="We're on a mission to replace paper business cards with a smarter, greener, more memorable way to connect."
      />

      {/* Premium hero showcase — story left, NFC card product render right */}
      <section className="bg-background py-16 sm:py-20">
        <div className="container-page grid items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
              OUR STORY
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              A smarter way to <span className="text-gradient-brand">introduce yourself</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              VR's NEXORA is a digital business card platform built for the modern professional.
              Instead of printing hundreds of cards that end up in a drawer, our NFC-enabled cards
              let you share a rich, always up-to-date profile with a single tap — no app required
              on the recipient's end.
            </p>
            <p className="mt-4 text-muted-foreground">
              Founded by a small team of designers and engineers who were tired of running out of
              paper cards at networking events, VR's NEXORA has grown into a platform trusted by
              individuals, startups, and enterprise teams across the globe to make every
              introduction count.
            </p>

            <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FEATURE_HIGHLIGHTS.map((f) => (
                <li key={f.label} className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                  {f.label}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <NfcCardShowcase />
          </div>
        </div>
      </section>

      {/* Our Mission — premium hero card */}
      <MissionShowcase />

      {/* Statistics showcase */}
      <StatsShowcaseCard />

      {/* Why Choose VR's NEXORA */}
      <section className="bg-background py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Why Choose VR's NEXORA?</h2>
            <p className="mt-3 text-muted-foreground">
              Everything you need to network smarter, in one premium card.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_CHOOSE.map((f) => (
              <div
                key={f.title}
                className="card-hover group relative rounded-[24px] border border-[#8B5CF6]/20 bg-card p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
              >
                <span
                  className="flex size-12 items-center justify-center rounded-xl text-white shadow-md"
                  style={{ background: f.bg }}
                >
                  <f.icon className="size-6" />
                </span>
                <span className="absolute right-5 top-5 flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-300 group-hover:border-primary group-hover:bg-primary group-hover:text-white">
                  <ChevronRight className="size-4" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Story + Values */}
      <section className="bg-secondary py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Built From Experience</h2>
            <p className="mt-3 text-muted-foreground">
              From a frustrating networking event to a platform used in 120+ countries.
            </p>
          </div>
          <div className="mt-12 grid items-center gap-12 lg:grid-cols-2">
            <div className="relative flex items-center justify-center">
              <div className="absolute size-64 rounded-full bg-gradient-to-br from-[#4F46E5]/10 via-[#7C3AED]/10 to-[#EC4899]/10 blur-3xl" />
              <img src={heroImg} alt="VR's NEXORA story" className="relative z-10 mx-auto w-full max-w-sm" />
            </div>
            <div>
              <p className="text-muted-foreground">
                It started with a simple frustration — running out of paper cards at the exact
                moment a great connection was made. We asked ourselves: why hasn't the business
                card evolved in over a century?
              </p>
              <p className="mt-4 text-muted-foreground">
                So we built VR's NEXORA: a durable NFC card paired with a beautiful, editable digital
                profile. Update your details anytime, track every tap and scan, and never run out
                of cards again.
              </p>
            </div>
          </div>
          <div className="mt-16 grid grid-cols-2 gap-6 lg:grid-cols-4">
            {VALUES.map((v) => (
              <div key={v.title} className={`${cardClass} bg-card p-6 text-center`}>
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
