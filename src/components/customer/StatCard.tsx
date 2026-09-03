import type { LucideIcon } from "lucide-react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  deltaPct?: number | null
  loading?: boolean
}

export function StatCard({ label, value, icon: Icon, deltaPct, loading }: StatCardProps) {
  if (loading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
        </CardContent>
      </Card>
    )
  }

  const showDelta = typeof deltaPct === "number" && Number.isFinite(deltaPct)
  const positive = (deltaPct ?? 0) >= 0

  return (
    <Card className="rounded-2xl transition-shadow hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          {showDelta && (
            <p
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                positive ? "text-success" : "text-destructive",
              )}
            >
              {positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(deltaPct as number).toFixed(1)}% this week
            </p>
          )}
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}
