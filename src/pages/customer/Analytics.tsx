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
<<<<<<< HEAD
import { analyticsApi, leadsApi, type ApiAnalyticsEvent } from "@/lib/api"
=======
import { customerAnalyticsApi, customerLeadApi, type AnalyticsEventItem } from "@/lib/api"
import type { TrafficSource } from "@/types"

type Period = "daily" | "weekly" | "monthly"
>>>>>>> b82680aac13f3627b3ea99a2417041dd3442cc04

// Validated categorical palette (see dataviz skill) — fixed hue order, never cycled.
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"]

<<<<<<< HEAD
function bucketByDay(events: ApiAnalyticsEvent[], days: number) {
=======
// The tracking endpoint reports whatever device string the visitor's
// browser resolves to server-side — not the fixed Android/iOS/Other enum
// the old mock data used — so colors are assigned by first-seen order
// instead of a fixed lookup table.
function colorForDevice(index: number) {
  return PALETTE[index % PALETTE.length]
}

// Only two of the mock's five traffic sources have a real signal today:
// NFC_TAP events (tagged source="nfc") and QR_SCAN events (source="qr").
// Social Media/Search/Referral would need referrer tracking that doesn't
// exist server-side yet, so they're simply never added to the map below —
// already-existing "filter to sources present" logic keeps them off the chart.
const TRAFFIC_ORDER: TrafficSource[] = ["Direct Tap", "Social Media", "QR Scan", "Search", "Referral"]
const TRAFFIC_COLORS: Record<TrafficSource, string> = {
  "Direct Tap": PALETTE[0],
  "Social Media": PALETTE[1],
  "QR Scan": PALETTE[2],
  Search: PALETTE[3],
  Referral: PALETTE[4],
}

function startOfWeek(d: Date) {
  const copy = new Date(d)
  const day = copy.getDay()
  const diff = (day + 6) % 7 // days since Monday
  copy.setDate(copy.getDate() - diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function buildSeries(events: AnalyticsEventItem[], period: Period) {
>>>>>>> b82680aac13f3627b3ea99a2417041dd3442cc04
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(now.getDate() - days)
  cutoff.setHours(0, 0, 0, 0)

<<<<<<< HEAD
  const byDate = new Map<string, number>()
  for (const event of events) {
    const date = new Date(event.created_at)
    if (date < cutoff) continue
    const key = date.toISOString().slice(0, 10)
    byDate.set(key, (byDate.get(key) ?? 0) + 1)
=======
  const inWindow = events.filter((e) => new Date(e.createdAt) >= cutoff)
  const buckets = new Map<string, { label: string; taps: number }>()

  for (const e of inWindow) {
    const d = new Date(e.createdAt)
    let key: string
    let label: string
    if (period === "daily") {
      key = d.toISOString().slice(0, 10)
      label = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    } else if (period === "weekly") {
      const weekStart = startOfWeek(d)
      key = weekStart.toISOString().slice(0, 10)
      label = weekStart.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`
      label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
    }
    const existing = buckets.get(key)
    if (existing) existing.taps += 1
    else buckets.set(key, { label, taps: 1 })
>>>>>>> b82680aac13f3627b3ea99a2417041dd3442cc04
  }
  return Array.from(byDate.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, count]) => ({
      label: new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      count,
    }))
}

<<<<<<< HEAD
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
=======
async function computeAnalytics(period: Period) {
  const [summary, tapEvents, viewEvents, scanEvents, leads] = await Promise.all([
    customerAnalyticsApi.summary(),
    customerAnalyticsApi.taps(),
    customerAnalyticsApi.views(),
    customerAnalyticsApi.scans(),
    customerLeadApi.count(),
  ])

  const totals = {
    taps: summary.totals.nfcTaps,
    qrScans: summary.totals.qrScans,
    profileViews: summary.totals.profileViews,
    // No unique-visitor dedup exists server-side yet (would need
    // IP/session tracking) — 0 until that's built.
    uniqueVisitors: 0,
    shares: summary.totals.socialClicks,
    leads,
  }

  const series = buildSeries(tapEvents, period)

  const allEvents = [...tapEvents, ...viewEvents, ...scanEvents]
  const byDevice = new Map<string, number>()
  for (const e of allEvents) byDevice.set(e.device, (byDevice.get(e.device) ?? 0) + 1)
  const deviceData = Array.from(byDevice.entries())
    .map(([device, taps], index) => ({ device, taps, color: colorForDevice(index) }))
    .sort((a, b) => b.taps - a.taps)

  const bySource = new Map<TrafficSource, number>()
  for (const _e of tapEvents) bySource.set("Direct Tap", (bySource.get("Direct Tap") ?? 0) + 1)
  for (const _e of scanEvents) bySource.set("QR Scan", (bySource.get("QR Scan") ?? 0) + 1)
  const totalSourceCount = Array.from(bySource.values()).reduce((s, v) => s + v, 0) || 1
  const trafficData = TRAFFIC_ORDER.filter((s) => bySource.has(s)).map((source) => {
    const count = bySource.get(source) ?? 0
    const pct = (count / totalSourceCount) * 100
    return { source, count, pctLabel: `${pct.toFixed(0)}%` }
  })

  // No location data is captured by the tracking endpoints yet — the
  // widget below already renders a graceful "no data" state for this.
  const topLocations: { location: string; taps: number; pct: number }[] = []

  return { totals, series, deviceData, trafficData, topLocations }
}

const PERIOD_LABEL: Record<Period, string> = {
  daily: "Daily · Last 7 Days",
  weekly: "Weekly · Last 8 Weeks",
  monthly: "Monthly · Last 6 Months",
>>>>>>> b82680aac13f3627b3ea99a2417041dd3442cc04
}

export default function CustomerAnalytics() {
  const customer = useCustomerAuthStore((s) => s.customer)

<<<<<<< HEAD
  const summaryQuery = useQuery({
    queryKey: ["customer-analytics-summary"],
    queryFn: analyticsApi.getSummary,
    enabled: Boolean(customer),
=======
  const { data, isLoading } = useQuery({
    queryKey: ["customer-analytics", customer?.id, period],
    queryFn: () => computeAnalytics(period),
    enabled: Boolean(customer?.id),
>>>>>>> b82680aac13f3627b3ea99a2417041dd3442cc04
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
<<<<<<< HEAD
                    {deviceData.map((entry) => (
=======
                    {data.deviceData.map((entry) => (
>>>>>>> b82680aac13f3627b3ea99a2417041dd3442cc04
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
