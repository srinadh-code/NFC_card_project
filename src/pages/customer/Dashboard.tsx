import { useMemo } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts"
import { BarChart3, CreditCard, Eye, MapPin, MousePointerClick, QrCode, Users, Zap } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartContainer } from "@/components/ui/chart-container"
import { StatCard } from "@/components/customer/StatCard"
import { useCustomerAuthStore } from "@/store/auth-store"
import { useDataStore, selectCardsByCustomer } from "@/store/data-store"
import { analyticsRecords } from "@/data/seed"
import { simulateLatency } from "@/lib/mock-api"

function sumBy<T>(items: T[], fn: (item: T) => number) {
  return items.reduce((s, item) => s + fn(item), 0)
}

function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}

function computeDashboardStats(customerId: string) {
  const records = analyticsRecords.filter((r) => r.customerId === customerId)

  const now = new Date()
  const last7Start = new Date(now)
  last7Start.setDate(now.getDate() - 7)
  const prev7Start = new Date(now)
  prev7Start.setDate(now.getDate() - 14)

  const last7 = records.filter((r) => new Date(r.date) >= last7Start)
  const prev7 = records.filter((r) => new Date(r.date) >= prev7Start && new Date(r.date) < last7Start)

  const totals = {
    taps: sumBy(records, (r) => r.taps),
    uniqueVisitors: sumBy(records, (r) => r.uniqueVisitors),
    qrScans: sumBy(records, (r) => r.qrScans),
    profileViews: sumBy(records, (r) => r.profileViews),
  }

  const deltas = {
    taps: deltaPct(sumBy(last7, (r) => r.taps), sumBy(prev7, (r) => r.taps)),
    uniqueVisitors: deltaPct(sumBy(last7, (r) => r.uniqueVisitors), sumBy(prev7, (r) => r.uniqueVisitors)),
    qrScans: deltaPct(sumBy(last7, (r) => r.qrScans), sumBy(prev7, (r) => r.qrScans)),
    profileViews: deltaPct(sumBy(last7, (r) => r.profileViews), sumBy(prev7, (r) => r.profileViews)),
  }

  // Taps over time, last 30 days
  const last30Start = new Date(now)
  last30Start.setDate(now.getDate() - 30)
  const byDate = new Map<string, number>()
  for (const r of records) {
    if (new Date(r.date) < last30Start) continue
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.taps)
  }
  const series = Array.from(byDate.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, taps]) => ({
      date: new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      taps,
    }))

  // Top locations
  const byLocation = new Map<string, number>()
  for (const r of records) {
    byLocation.set(r.location, (byLocation.get(r.location) ?? 0) + r.taps)
  }
  const totalLocationTaps = Array.from(byLocation.values()).reduce((s, v) => s + v, 0) || 1
  const topLocations = Array.from(byLocation.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([location, taps]) => ({ location, taps, pct: (taps / totalLocationTaps) * 100 }))

  return { totals, deltas, series, topLocations }
}

export default function CustomerDashboard() {
  const customer = useCustomerAuthStore((s) => s.customer)
  const cards = useDataStore(selectCardsByCustomer(customer?.id ?? ""))
  const activeCard = useMemo(() => cards.find((c) => c.status === "Active") ?? cards[0] ?? null, [cards])

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats", customer?.id],
    queryFn: () => simulateLatency(computeDashboardStats(customer?.id ?? ""), 300),
    enabled: Boolean(customer?.id),
  })

  if (!customer) return null

  const firstName = customer.name.split(" ")[0]

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <Card className="overflow-hidden rounded-3xl border-0 bg-gradient-brand-br text-white shadow-glow-primary-lg">
        <CardContent className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Welcome back, {firstName} 👋</h1>
            <p className="max-w-md text-sm text-white/70">
              Here&apos;s a quick look at how your digital card is performing today.
            </p>
            {activeCard ? (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Badge className="bg-success text-success-foreground">Active</Badge>
                <span className="text-sm text-white/80">
                  Card ID: <span className="font-mono">{activeCard.id}</span>
                </span>
              </div>
            ) : (
              <div className="pt-2">
                <Button asChild variant="secondary" size="sm">
                  <Link to="/my-card">Activate your card</Link>
                </Button>
              </div>
            )}
          </div>

          <div className="relative h-28 w-48 shrink-0">
            <div className="absolute left-0 top-0 flex h-28 w-48 flex-col justify-between rounded-2xl border border-white/25 bg-white/10 p-4 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between">
                <Zap className="size-5" fill="currentColor" />
                <CreditCard className="size-5 text-white/60" />
              </div>
              <div>
                <p className="text-sm font-semibold">{customer.name}</p>
                <p className="text-xs text-white/60">{activeCard ? activeCard.id : "No card yet"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Taps"
          value={data ? data.totals.taps.toLocaleString("en-IN") : 0}
          icon={MousePointerClick}
          deltaPct={data?.deltas.taps ?? null}
          loading={isLoading}
        />
        <StatCard
          label="Unique Visitors"
          value={data ? data.totals.uniqueVisitors.toLocaleString("en-IN") : 0}
          icon={Users}
          deltaPct={data?.deltas.uniqueVisitors ?? null}
          loading={isLoading}
        />
        <StatCard
          label="QR Scans"
          value={data ? data.totals.qrScans.toLocaleString("en-IN") : 0}
          icon={QrCode}
          deltaPct={data?.deltas.qrScans ?? null}
          loading={isLoading}
        />
        <StatCard
          label="Profile Views"
          value={data ? data.totals.profileViews.toLocaleString("en-IN") : 0}
          icon={Eye}
          deltaPct={data?.deltas.profileViews ?? null}
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-primary" />
              Taps Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-[280px] w-full" />
            ) : (
              <ChartContainer height={280}>
                <LineChart data={data.series} margin={{ left: -20, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="taps"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="size-4 text-primary" />
              Top Locations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading || !data ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : data.topLocations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No location data yet.</p>
            ) : (
              data.topLocations.map((loc) => (
                <div key={loc.location} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{loc.location}</span>
                    <span className="text-muted-foreground">{loc.pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${loc.pct}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
