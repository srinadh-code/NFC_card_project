import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Eye,
  Handshake,
  MapPin,
  MonitorSmartphone,
  MousePointerClick,
  QrCode,
  Share2,
  Users,
  Radar,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartContainer } from "@/components/ui/chart-container"
import { StatCard } from "@/components/customer/StatCard"
import { useCustomerAuthStore } from "@/store/auth-store"
import { customerAnalyticsApi, customerLeadApi, type AnalyticsEventItem } from "@/lib/api"
import type { TrafficSource } from "@/types"

type Period = "daily" | "weekly" | "monthly"

// Validated categorical palette (see dataviz skill) — fixed hue order, never cycled.
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"]

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
  const now = new Date()
  const cutoff = new Date(now)
  if (period === "daily") cutoff.setDate(now.getDate() - 6)
  else if (period === "weekly") cutoff.setDate(now.getDate() - 7 * 7) // last ~8 weeks
  else cutoff.setMonth(now.getMonth() - 5) // last ~6 months
  cutoff.setHours(0, 0, 0, 0)

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
  }

  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, v]) => v)
}

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
}

export default function CustomerAnalytics() {
  const customer = useCustomerAuthStore((s) => s.customer)
  const [period, setPeriod] = useState<Period>("daily")

  const { data, isLoading } = useQuery({
    queryKey: ["customer-analytics", customer?.id, period],
    queryFn: () => computeAnalytics(period),
    enabled: Boolean(customer?.id),
  })

  if (!customer) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Track how people engage with your digital card.</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily (Last 7 Days)</SelectItem>
            <SelectItem value="weekly">Weekly (Last 8 Weeks)</SelectItem>
            <SelectItem value="monthly">Monthly (Last 6 Months)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total Taps"
          value={data ? data.totals.taps.toLocaleString("en-IN") : 0}
          icon={MousePointerClick}
          loading={isLoading}
        />
        <StatCard
          label="QR Scans"
          value={data ? data.totals.qrScans.toLocaleString("en-IN") : 0}
          icon={QrCode}
          loading={isLoading}
        />
        <StatCard
          label="Profile Views"
          value={data ? data.totals.profileViews.toLocaleString("en-IN") : 0}
          icon={Eye}
          loading={isLoading}
        />
        <StatCard
          label="Unique Visitors"
          value={data ? data.totals.uniqueVisitors.toLocaleString("en-IN") : 0}
          icon={Users}
          loading={isLoading}
        />
        <StatCard
          label="Shares"
          value={data ? data.totals.shares.toLocaleString("en-IN") : 0}
          icon={Share2}
          loading={isLoading}
        />
        <StatCard
          label="Leads Generated"
          value={data ? data.totals.leads.toLocaleString("en-IN") : 0}
          icon={Handshake}
          loading={isLoading}
        />
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Taps Over Time</CardTitle>
          <p className="text-xs text-muted-foreground">{data ? PERIOD_LABEL[period] : ""}</p>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <Skeleton className="h-[280px] w-full" />
          ) : data.series.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No activity in this period.</p>
          ) : (
            <ChartContainer height={280}>
              <LineChart data={data.series} margin={{ left: -20, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <RechartsTooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }} />
                <Line type="monotone" dataKey="taps" stroke="var(--primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
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
            {isLoading || !data ? (
              <Skeleton className="h-[260px] w-full" />
            ) : data.deviceData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No device data yet.</p>
            ) : (
              <ChartContainer height={260}>
                <PieChart>
                  <Pie
                    data={data.deviceData}
                    dataKey="taps"
                    nameKey="device"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {data.deviceData.map((entry) => (
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
            {isLoading || !data ? (
              <Skeleton className="h-[260px] w-full" />
            ) : data.trafficData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No traffic data yet.</p>
            ) : (
              <ChartContainer height={260}>
                <BarChart data={data.trafficData} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="source"
                    width={90}
                    tick={{ fontSize: 11 }}
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }}
                    formatter={(value, _name, item) => {
                      const payload = item?.payload as { pctLabel?: string } | undefined
                      return [`${value} visits (${payload?.pctLabel ?? ""})`, "Traffic"]
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
                    {data.trafficData.map((entry) => (
                      <Cell key={entry.source} fill={TRAFFIC_COLORS[entry.source]} />
                    ))}
                    <LabelList dataKey="pctLabel" position="right" style={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

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
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              {data.topLocations.map((loc) => (
                <div key={loc.location} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{loc.location}</span>
                    <span className="text-muted-foreground">
                      {loc.taps.toLocaleString("en-IN")} taps · {loc.pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${loc.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
