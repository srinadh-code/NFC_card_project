import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Download, Radio, Users, QrCode, TrendingUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChartContainer } from "@/components/ui/chart-container"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard } from "@/components/admin/StatCard"
import { downloadCsv } from "@/components/admin/export-csv"
import { adminAnalyticsApi } from "@/lib/api"

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
]

export default function AdminAnalytics() {
  const [range, setRange] = useState("30")

  const { data, isLoading } = useQuery({
    queryKey: ["admin-analytics", range],
    queryFn: () => adminAnalyticsApi.summary({ range: Number(range) }),
  })

  const stats = useMemo(() => {
    const totalTaps = data?.totalTaps ?? 0
    const totalUniqueVisitors = data?.uniqueVisitors ?? 0
    const totalQrScans = data?.qrScans ?? 0
    const days = Number(range)
    const avgTapsPerDay = days > 0 ? totalTaps / days : 0
    return { totalTaps, totalUniqueVisitors, totalQrScans, avgTapsPerDay }
  }, [data, range])

  const chartData = useMemo(() => {
    if (!data) return []
    return data.byDay.map((d) => ({
      date: new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      taps: d.count,
    }))
  }, [data])

  const topLocations = useMemo(() => {
    if (!data) return []
    const sorted = [...data.topLocations].sort((a, b) => b.count - a.count).slice(0, 8)
    const max = sorted[0]?.count ?? 1
    return sorted.map((l) => ({ location: l.location, count: l.count, pct: (l.count / max) * 100 }))
  }, [data])

  function handleExport() {
    if (!data) return
    downloadCsv(
      `analytics-last-${range}-days.csv`,
      data.byDay.map((d) => ({ Date: d.date, Taps: d.count })),
    )
    toast.success("Analytics exported to CSV.")
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Tap and engagement analytics across all customers</p>
        </div>
        <div className="flex gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport}>
            <Download /> Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Taps" value={stats.totalTaps} icon={Radio} />
        <StatCard label="Unique Visitors" value={stats.totalUniqueVisitors} icon={Users} />
        <StatCard label="QR Scans" value={stats.totalQrScans} icon={QrCode} />
        <StatCard label="Avg Taps / Day" value={stats.avgTapsPerDay.toFixed(1)} icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Taps Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer>
              <AreaChart data={chartData} margin={{ left: -20 }}>
                <defs>
                  <linearGradient id="tapsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid var(--border)" }} />
                <Area
                  type="monotone"
                  dataKey="taps"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  fill="url(#tapsGradient)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Locations</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {topLocations.map((loc) => (
              <div key={loc.location} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">{loc.location}</span>
                  <span className="font-medium text-muted-foreground">{loc.count}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${loc.pct}%` }} />
                </div>
              </div>
            ))}
            {topLocations.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No data for this range.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
