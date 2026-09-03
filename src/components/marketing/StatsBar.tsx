import { Users, User, ShieldCheck, Leaf } from "lucide-react"

const STATS = [
  { icon: Users, value: "10,000+", label: "Connections Shared" },
  { icon: User, value: "5,000+", label: "Active Users" },
  { icon: ShieldCheck, value: "99.9%", label: "Uptime" },
  { icon: Leaf, value: "100%", label: "Eco-Friendly" },
]

export default function StatsBar() {
  return (
    <section className="relative overflow-hidden bg-gradient-brand px-4 py-14">
      <div className="pointer-events-none absolute -top-24 left-1/4 size-64 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-1/4 size-64 rounded-full bg-white/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-5xl grid-cols-2 gap-8 sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="flex flex-col items-center text-center text-white">
            <span className="flex size-10 items-center justify-center rounded-full bg-white/15 backdrop-blur">
              <s.icon className="size-5" />
            </span>
            <p className="mt-3 text-2xl font-bold sm:text-3xl">{s.value}</p>
            <p className="mt-1 text-sm text-white/80">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
