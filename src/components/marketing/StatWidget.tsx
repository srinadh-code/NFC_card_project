import type { LucideIcon } from "lucide-react"
import { TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatWidgetProps {
  icon: LucideIcon
  label: string
  value: string
  deltaPct: string
  iconBg: string
  /** Sparkline sample points, 0-100 scale — purely decorative example data. */
  points: number[]
  sparkColor?: string
  className?: string
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 60
  const h = 20
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = max - min || 1
  const step = w / (points.length - 1)
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`)
    .join(" ")

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-5 w-16 shrink-0" fill="none" aria-hidden="true">
      <path d={path} stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function StatWidget({ icon: Icon, label, value, deltaPct, iconBg, points, sparkColor = "#4F46E5", className }: StatWidgetProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.1)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: iconBg }}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="text-lg font-bold leading-tight text-foreground">{value}</p>
        <p className="flex items-center gap-0.5 text-[11px] font-semibold text-[#22C55E]">
          <TrendingUp className="size-3" />
          {deltaPct}
        </p>
      </div>
      <Sparkline points={points} color={sparkColor} />
    </div>
  )
}
