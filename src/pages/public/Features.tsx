import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Zap,
  UserCog,
  Nfc,
  BarChart3,
  Share2,
  RefreshCcw,
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
import CtaBanner from "@/components/marketing/CtaBanner"
import StatsBar from "@/components/marketing/StatsBar"
import { StatWidget } from "@/components/marketing/StatWidget"
import { NfcCardFace } from "@/components/marketing/NfcCardShowcase"
import DashboardMockup from "@/components/marketing/DashboardMockup"
import ProfilePhonePreview from "@/components/marketing/ProfilePhonePreview"
import { Reveal } from "@/components/marketing/Reveal"

const AVATAR_SEEDS = ["ananya-reddy", "rahul-menon", "priya-nair", "karthik-iyer"]

const FEATURES = [
  { icon: Zap, title: "Instant Sharing", description: "Share your complete profile instantly with a single tap.", bg: "linear-gradient(135deg,#4F46E5,#7C3AED)" },
  { icon: UserCog, title: "Custom Profiles", description: "Personalize your bio, photo, branding, and layout.", bg: "linear-gradient(135deg,#EC4899,#F472B6)" },
  { icon: Nfc, title: "NFC & QR Code", description: "Works via NFC tap and QR code, compatible with every device.", bg: "linear-gradient(135deg,#2563EB,#06B6D4)" },
  { icon: BarChart3, title: "Real-time Analytics", description: "See exactly who's viewing your profile, when, and from where.", bg: "linear-gradient(135deg,#22C55E,#10B981)" },
  { icon: Share2, title: "Social Integrations", description: "Link LinkedIn, Instagram, WhatsApp and more to connect instantly.", bg: "linear-gradient(135deg,#F97316,#F59E0B)" },
  { icon: RefreshCcw, title: "Easy Updates", description: "Change your details anytime — no need to reprint a card.", bg: "linear-gradient(135deg,#7C3AED,#4F46E5)" },
]

export default function Features() {
  const navigate = useNavigate()
  const [demoOpen, setDemoOpen] = useState(false)

  return (
    <div className="overflow-x-hidden">
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden bg-white px-4 pb-24 pt-16 sm:pt-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: "radial-gradient(circle, #C4B5FD 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(ellipse 60% 60% at 70% 30%, black, transparent)",
          }}
        />
        <div className="pointer-events-none absolute right-0 top-0 size-[32rem] rounded-full bg-gradient-to-br from-[#7C3AED]/20 to-[#EC4899]/10 blur-[100px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm">
              <span className="rounded-full bg-[#4F46E5]/10 px-2 py-0.5 text-[#4F46E5]">FEATURES</span>
              Built for the Modern Professional
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl">
              More Than a Card.
              <br />
              <span className="text-gradient-brand">A Smarter Way</span>
              <br />
              <span className="text-gradient-brand">to Connect.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              Powerful features to help you create, share, and grow your digital identity — all
              with a single tap.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Button size="lg" variant="gradient" onClick={() => navigate("/shop")}>
                Order Your Card
                <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" className="gap-2" onClick={() => setDemoOpen(true)}>
                <PlayCircle className="size-4" />
                Watch Demo
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
                <p className="text-sm font-medium text-foreground">Trusted by 10,000+ professionals</p>
              </div>
            </div>
          </div>

          {/* Right: dual NFC card render + floating widgets */}
          <div className="relative flex items-center justify-center py-10 lg:py-0">
            <div className="pointer-events-none absolute size-96 rounded-full bg-gradient-to-br from-[#7C3AED]/20 via-[#EC4899]/15 to-transparent blur-3xl" />

            {/* Annotation — sits clear above the whole card + widget cluster */}
            <p className="absolute left-1/2 -top-10 hidden w-max max-w-[220px] -translate-x-1/2 rotate-1 text-center font-serif text-xs italic text-muted-foreground sm:block">
              Just a tap and you&apos;re connected!
            </p>

            <div className="relative h-[220px] w-full max-w-[360px] sm:h-[260px]">
              {/* Gold card, behind */}
              <div className="absolute inset-0 translate-x-8 translate-y-4 animate-float-slower">
                <div className="h-full w-full rotate-6">
                  <NfcCardFace tone="gold" />
                </div>
              </div>
              {/* Black card, front */}
              <div className="absolute inset-0 animate-float-slow">
                <div className="h-full w-full -rotate-6 cursor-pointer transition-transform duration-500 ease-out hover:-rotate-2 hover:scale-[1.03]">
                  <NfcCardFace tone="front" />
                </div>
              </div>
            </div>

            {/* Floating analytics widgets */}
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
      <section className="bg-[#F8FAFC] px-4 py-20">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Everything You Need, Built In
              </h2>
              <p className="mt-3 text-muted-foreground">
                Six premium capabilities that turn a simple tap into a lasting connection.
              </p>
            </div>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delayMs={i * 80}>
                <div className="card-hover group flex items-start gap-4 rounded-[24px] border border-border/70 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                  <span
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
                    style={{ background: f.bg }}
                  >
                    <f.icon className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground">{f.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
                  </div>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-300 group-hover:border-primary group-hover:bg-primary group-hover:text-white">
                    <ArrowUpRight className="size-4" />
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ ANALYTICS SHOWCASE ============ */}
      <section className="bg-white px-4 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#EEF2FF] via-[#F5F3FF] to-[#FDF2F8] p-8 sm:p-14">
            <div className="pointer-events-none absolute -left-16 -top-16 size-72 rounded-full bg-[#7C3AED]/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -right-16 size-72 rounded-full bg-[#2563EB]/15 blur-3xl" />

            <div className="relative grid items-center gap-12 lg:grid-cols-2">
              <Reveal>
                <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold tracking-wide text-[#4F46E5] shadow-sm">
                  ANALYTICS · Data That Drives Opportunities
                </span>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Track Your Connections
                  <br />
                  <span className="text-gradient-brand">in Real Time</span>
                </h2>
                <p className="mt-4 max-w-md text-muted-foreground">
                  Get insights into your profile views, taps, locations, and more. Turn every
                  connection into an opportunity.
                </p>
                <Button size="lg" variant="gradient" className="mt-8" onClick={() => navigate("/login")}>
                  View Dashboard
                  <ArrowRight className="size-4" />
                </Button>
              </Reveal>

              <Reveal variant="scale" delayMs={100}>
                <div className="relative">
                  <DashboardMockup />
                  <ProfilePhonePreview className="absolute -bottom-10 -right-6 hidden rotate-3 animate-float-slow sm:block" />
                  <p className="absolute -bottom-14 right-32 hidden max-w-[110px] -rotate-2 text-right font-serif text-xs italic text-muted-foreground lg:block">
                    Your profile, your rules.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ============ STATS ============ */}
      <StatsBar />

      <CtaBanner title="Ready to Experience the Power of VR's NEXORA?" />
    </div>
  )
}
