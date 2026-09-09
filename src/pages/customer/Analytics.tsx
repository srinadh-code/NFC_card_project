import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Cell,
  Legend,
  Line,
  LineChart,
  CartesianGrid,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Eye, Handshake, MonitorSmartphone, MousePointerClick, QrCode, Radar, BookmarkCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartContainer } from "@/components/ui/chart-container"
import { ErrorState } from "@/components/customer/ErrorState"
import { StatCard } from "@/components/customer/StatCard"
import { useCustomerAuthStore } from "@/store/auth-store"
import { analyticsApi, leadsApi, type ApiAnalyticsEvent } from "@/lib/api"

// Validated categorical palette (see dataviz skill) — fixed hue order, never cycled.
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"]

function bucketByDay(events: ApiAnalyticsEvent[], days: number) {
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(now.getDate() - days)
  cutoff.setHours(0, 0, 0, 0)

  const byDate = new Map<string, number>()
  for (const event of events) {
    const date = new Date(event.created_at)
    if (date < cutoff) continue
    const key = date.toISOString().slice(0, 10)
    byDate.set(key, (byDate.get(key) ?? 0) + 1)
  }
  return Array.from(byDate.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, count]) => ({
      label: new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      count,
    }))
}

function tally<T extends string>(events: ApiAnalyticsEvent[], pick: (e: ApiAnalyticsEvent) => T) {
  const counts = new Map<T, number>()
  for (const event of events) {
    const key = pick(event)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}

export default function CustomerAnalytics() {
  const customer = useCustomerAuthStore((s) => s.customer)

  const summaryQuery = useQuery({
    queryKey: ["customer-analytics-summary"],
    queryFn: analyticsApi.getSummary,
    enabled: Boolean(customer),
  })
  const viewsQuery = useQuery({
    queryKey: ["customer-analytics-views", 100],
    queryFn: () => analyticsApi.getViews(1, 100),
    enabled: Boolean(customer),
  })
  const tapsQuery = useQuery({
    queryKey: ["customer-analytics-taps", 100],
    queryFn: () => analyticsApi.getTaps(1, 100),
    enabled: Boolean(customer),
  })
  const scansQuery = useQuery({
    queryKey: ["customer-analytics-scans", 100],
    queryFn: () => analyticsApi.getScans(1, 100),
    enabled: Boolean(customer),
  })
  const leadsQuery = useQuery({
    queryKey: ["customer-leads-count"],
    queryFn: () => leadsApi.list(1),
    enabled: Boolean(customer),
  })

  const isLoading =
    summaryQuery.isLoading || viewsQuery.isLoading || tapsQuery.isLoading || scansQuery.isLoading || leadsQuery.isLoading
  const isError = summaryQuery.isError || viewsQuery.isError || tapsQuery.isError || scansQuery.isError

  const allEvents = useMemo(
    () => [...(viewsQuery.data?.items ?? []), ...(tapsQuery.data?.items ?? []), ...(scansQuery.data?.items ?? [])],
    [viewsQuery.data, tapsQuery.data, scansQuery.data],
  )

  const tapsSeries = useMemo(() => bucketByDay(tapsQuery.data?.items ?? [], 30), [tapsQuery.data])

  const deviceData = useMemo(() => {
    const rows = tally(allEvents, (e) => (e.device || "Unknown") as string)
    return rows.map((r, i) => ({ device: r.key, count: r.count, color: PALETTE[i % PALETTE.length] }))
  }, [allEvents])

  const sourceData = useMemo(() => {
    const rows = tally(allEvents, (e) => (e.source || "Direct") as string)
    return rows.map((r, i) => ({ source: r.key, count: r.count, color: PALETTE[i % PALETTE.length] }))
  }, [allEvents])

  function retryAll() {
    summaryQuery.refetch()
    viewsQuery.refetch()
    tapsQuery.refetch()
    scansQuery.refetch()
    leadsQuery.refetch()
  }

  if (!customer) return null

  if (isError) {
    return <ErrorState error={summaryQuery.error ?? viewsQuery.error} onRetry={retryAll} />
  }

  const totals = summaryQuery.data?.totals

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Track how people engage with your digital card — based on the last 100 recorded events per type.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Profile Views"
          value={totals ? totals.profile_views.toLocaleString("en-IN") : 0}
          icon={Eye}
          loading={isLoading}
        />
        <StatCard
          label="NFC Taps"
          value={totals ? totals.nfc_taps.toLocaleString("en-IN") : 0}
          icon={MousePointerClick}
          loading={isLoading}
        />
        <StatCard
          label="QR Scans"
          value={totals ? totals.qr_scans.toLocaleString("en-IN") : 0}
          icon={QrCode}
          loading={isLoading}
        />
        <StatCard
          label="Social Clicks"
          value={totals ? totals.social_clicks.toLocaleString("en-IN") : 0}
          icon={BookmarkCheck}
          loading={isLoading}
        />
        <StatCard
          label="Leads Generated"
          value={leadsQuery.data?.pagination?.count ?? 0}
          icon={Handshake}
          loading={isLoading}
        />
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">NFC Taps — Last 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : tapsSeries.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No taps recorded yet.</p>
          ) : (
            <ChartContainer height={280}>
              <LineChart data={tapsSeries} margin={{ left: -20, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <RechartsTooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }} />
                <Line type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MonitorSmartphone className="size-4 text-primary" />
              Device Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : deviceData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No device data yet.</p>
            ) : (
              <ChartContainer height={260}>
                <PieChart>
                  <Pie
                    data={deviceData}
                    dataKey="count"
                    nameKey="device"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {deviceData.map((entry) => (
                      <Cell key={entry.device} fill={entry.color} stroke="var(--card)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={32} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <RechartsTooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radar className="size-4 text-primary" />
              Traffic Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : sourceData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No traffic source data yet.</p>
            ) : (
              <ChartContainer height={260}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    dataKey="count"
                    nameKey="source"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {sourceData.map((entry) => (
                      <Cell key={entry.source} fill={entry.color} stroke="var(--card)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={32} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <RechartsTooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
