import type { LucideIcon } from "lucide-react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface StatCardTrend {
  value: number // percentage, e.g. 12.3 or -4.5
  label?: string // defaults to "vs last month"
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  className,
}: {
  label: string
  value: string | number
  icon: LucideIcon
  trend?: StatCardTrend
  className?: string
}) {
  const isPositive = (trend?.value ?? 0) >= 0
  return (
    <Card className={cn("rounded-xl shadow-sm", className)}>
      <CardContent className="flex items-start justify-between gap-3 px-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-2xl font-semibold tracking-tight">{value}</span>
          {trend && (
            <span
              className={cn(
                "mt-1 inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium",
                isPositive
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {isPositive ? (
                <ArrowUpRight className="size-3" />
              ) : (
                <ArrowDownRight className="size-3" />
              )}
              {Math.abs(trend.value).toFixed(1)}% {trend.label ?? "vs last month"}
            </span>
          )}
        </div>
        <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}
