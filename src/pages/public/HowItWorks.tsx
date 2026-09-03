import { ShoppingBag, PackageCheck, Nfc, UserCircle2, Share2 } from "lucide-react"
import PageHeader from "@/components/marketing/PageHeader"
import CtaBanner from "@/components/marketing/CtaBanner"

const STEPS = [
  {
    icon: ShoppingBag,
    title: "Order Your Card",
    description: "Pick your card type, color, and quantity, then place your order in minutes.",
    from: "#4F46E5",
    to: "#6366F1",
  },
  {
    icon: PackageCheck,
    title: "Receive Your NFC Card",
    description: "Your card ships within 1-2 days and arrives at your doorstep in 5-7 business days.",
    from: "#2563EB",
    to: "#06B6D4",
  },
  {
    icon: Nfc,
    title: "Activate Your Card",
    description: "Scan the card once and link it to your TapLink account to activate it instantly.",
    from: "#7C3AED",
    to: "#EC4899",
  },
  {
    icon: UserCircle2,
    title: "Create Your Profile",
    description: "Add your name, photo, bio, and social links to build your digital business card.",
    from: "#F59E0B",
    to: "#F97316",
  },
  {
    icon: Share2,
    title: "Start Sharing",
    description: "Tap your card on any smartphone to instantly share your profile — no app needed.",
    from: "#22C55E",
    to: "#06B6D4",
  },
]

export default function HowItWorks() {
  return (
    <div>
      <PageHeader
        title="How TapLink Works"
        subtitle="Get from unboxing to your first tap in five simple steps."
      />

      <section className="bg-white px-4 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="relative grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
            <div className="pointer-events-none absolute inset-x-0 top-14 hidden h-0.5 bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#22C55E] opacity-20 lg:block" />
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="card-hover relative flex flex-col items-center rounded-[24px] p-6 text-center text-white shadow-[0_10px_30px_rgba(15,23,42,0.12)]"
                style={{ background: `linear-gradient(160deg, ${step.from}, ${step.to})` }}
              >
                <span className="absolute -top-3 flex size-7 items-center justify-center rounded-full bg-white text-xs font-bold text-foreground shadow">
                  {i + 1}
                </span>
                <div className="mt-2 flex size-14 items-center justify-center rounded-2xl bg-white/20">
                  <step.icon className="size-7" />
                </div>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-white/85">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner title="Ready to get your TapLink Card?" buttonLabel="Order Now" />
    </div>
  )
}
