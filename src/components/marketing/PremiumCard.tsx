import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Shared "premium SaaS" card recipe used across the public marketing site. */
export const cardClass =
  "rounded-[24px] bg-card border border-border shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_40px_rgba(79,70,229,0.15)] dark:hover:shadow-[0_20px_40px_rgba(139,92,246,0.4)]"

/** Gradient used for primary CTAs and accent highlights site-wide. */
export const gradientClass = "bg-gradient-brand"

interface PremiumCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export default function PremiumCard({ children, className, ...props }: PremiumCardProps) {
  return (
    <div className={cn(cardClass, className)} {...props}>
      {children}
    </div>
  )
}
