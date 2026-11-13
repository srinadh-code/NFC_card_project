import type { LucideIcon } from "lucide-react"
import PremiumCard from "@/components/marketing/PremiumCard"

interface FeatureCardProps {
  icon: LucideIcon
  title: string
  description: string
}

export default function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <PremiumCard className="p-6 hover:shadow-[0_20px_40px_rgba(var(--public-shadow-rgb),0.15)] dark:hover:shadow-[0_20px_40px_rgba(var(--public-shadow-rgb),0.4)]">
      <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-brand-br text-white shadow-[0_4px_14px_rgba(var(--public-shadow-rgb),0.35)]">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </PremiumCard>
  )
}
