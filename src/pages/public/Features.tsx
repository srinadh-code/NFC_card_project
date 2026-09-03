import { Zap, UserCog, Nfc, BarChart3, Share2, RefreshCcw } from "lucide-react"
import PageHeader from "@/components/marketing/PageHeader"
import FeatureCard from "@/components/marketing/FeatureCard"
import CtaBanner from "@/components/marketing/CtaBanner"

const FEATURES = [
  { icon: Zap, title: "Instant Sharing", description: "Share your entire profile in under a second with a single tap on any NFC-enabled phone." },
  { icon: UserCog, title: "Custom Profiles", description: "Fully personalize your bio, photo, branding, and layout to match your identity." },
  { icon: Nfc, title: "NFC & QR Code", description: "Every card works via NFC tap and a printed QR code, so it's compatible with every device." },
  { icon: BarChart3, title: "Real-time Analytics", description: "See exactly who's viewing your profile, when, and from where — in real time." },
  { icon: Share2, title: "Social Integrations", description: "Link LinkedIn, Instagram, WhatsApp, and more so contacts can connect instantly." },
  { icon: RefreshCcw, title: "Easy Update", description: "Change your details anytime from your dashboard — no need to ever reprint a card." },
]

export default function Features() {
  return (
    <div>
      <PageHeader
        title="Powerful Features for Better Connections"
        subtitle="Everything you need to network smarter, stay organized, and make a lasting impression."
      />

      <section className="bg-white px-4 py-20">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
          ))}
        </div>
      </section>

      <CtaBanner title="Ready to Experience the Power of TapLink?" />
    </div>
  )
}
