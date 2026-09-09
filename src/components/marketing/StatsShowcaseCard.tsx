import { Users, User, ShieldCheck, Globe } from "lucide-react"

const STATS = [
  { icon: Users, value: "100,000+", label: "Connections Shared", tone: "purple" as const },
  { icon: User, value: "50,000+", label: "Active Users", tone: "purple" as const },
  { icon: ShieldCheck, value: "99.9%", label: "Uptime", tone: "pink" as const },
  { icon: Globe, value: "120+", label: "Countries Reached", tone: "pink" as const },
]

export default function StatsShowcaseCard() {
  return (
    <section className="bg-background px-4 py-4 sm:py-8">
      <div className="mx-auto max-w-6xl rounded-[32px] bg-gradient-to-r from-[#6C4DFF] to-[#FF5DA8] p-[1.5px] shadow-[0_25px_70px_rgba(124,58,237,0.18)]">
        <div className="relative overflow-hidden rounded-[30.5px] bg-gradient-to-br from-[#F5F3FF] via-white to-[#FDF2F8] px-6 py-10 dark:from-card dark:via-card dark:to-card sm:px-10">
          <div className="pointer-events-none absolute -left-10 -top-10 size-56 rounded-full bg-[#7C3AED]/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 -bottom-10 size-56 rounded-full bg-[#EC4899]/10 blur-3xl" />

          <div className="relative grid grid-cols-2 sm:grid-cols-4">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={`group flex flex-col items-center px-4 py-4 text-center transition-transform duration-300 hover:-translate-y-1 ${
                  i > 0 ? "sm:border-l sm:border-border" : ""
                }`}
              >
                <span
                  className={`flex size-14 items-center justify-center rounded-2xl text-white shadow-md transition-shadow duration-300 group-hover:shadow-glow-primary ${
                    s.tone === "purple" ? "bg-gradient-to-br from-[#4F46E5] to-[#8B5CF6]" : "bg-gradient-to-br from-[#8B5CF6] to-[#EC4899]"
                  }`}
                >
                  <s.icon className="size-6" />
                </span>
                <p
                  className={`mt-4 text-3xl font-bold sm:text-4xl ${
                    s.tone === "purple" ? "text-[#6D28D9] dark:text-[#C4B5FD]" : "text-[#DB2777] dark:text-[#F9A8D4]"
                  }`}
                >
                  {s.value}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
