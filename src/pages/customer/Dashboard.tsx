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
import {
  BarChart3,
  Bell,
  BookmarkCheck,
  CreditCard,
  Eye,
  MousePointerClick,
  PackageSearch,
  QrCode,
  Users,
  Zap,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartContainer } from "@/components/ui/chart-container"
import { ErrorState } from "@/components/customer/ErrorState"
import { StatCard } from "@/components/customer/StatCard"
import { useCustomerAuthStore } from "@/store/auth-store"
import { analyticsApi, dashboardApi, notificationsApi, toFrontendCard } from "@/lib/api"

function bucketTapsByDay(events: { created_at: string }[], days: number) {
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
    .map(([date, taps]) => ({
      date: new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      taps,
    }))
}

export default function CustomerDashboard() {
  const customer = useCustomerAuthStore((s) => s.customer)

  const dashboardQuery = useQuery({
    queryKey: ["customer-dashboard"],
    queryFn: dashboardApi.get,
    enabled: Boolean(customer),
  })
  const summaryQuery = useQuery({
    queryKey: ["customer-analytics-summary"],
    queryFn: analyticsApi.getSummary,
    enabled: Boolean(customer),
  })
  const unreadQuery = useQuery({
    queryKey: ["customer-notifications-unread-count"],
    queryFn: () => notificationsApi.list(1, true),
    enabled: Boolean(customer),
  })
  const tapsSeriesQuery = useQuery({
    queryKey: ["customer-taps-series"],
    queryFn: () => analyticsApi.getTaps(1, 100),
    enabled: Boolean(customer),
  })

  const cards = useMemo(
    () => (dashboardQuery.data ? dashboardQuery.data.nfc_cards.map(toFrontendCard) : []),
    [dashboardQuery.data],
  )
  const activeCard = useMemo(() => cards.find((c) => c.status === "Active") ?? cards[0] ?? null, [cards])

  const series = useMemo(
    () => (tapsSeriesQuery.data ? bucketTapsByDay(tapsSeriesQuery.data.items, 30) : []),
    [tapsSeriesQuery.data],
  )

  if (!customer) return null

  const isLoading = dashboardQuery.isLoading || summaryQuery.isLoading || unreadQuery.isLoading
  const isError = dashboardQuery.isError || summaryQuery.isError

  if (isError) {
    return (
      <ErrorState
        onRetry={() => {
          dashboardQuery.refetch()
          summaryQuery.refetch()
        }}
      />
    )
  }

  const firstName = customer.name.split(" ")[0]
  const totals = dashboardQuery.data?.totals
  const socialClicks = summaryQuery.data?.totals.social_clicks

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
          value={socialClicks !== undefined ? socialClicks.toLocaleString("en-IN") : 0}
          icon={BookmarkCheck}
          loading={isLoading}
        />
        <StatCard
          label="Leads"
          value={totals ? totals.leads.toLocaleString("en-IN") : 0}
          icon={Users}
          loading={isLoading}
        />
        <StatCard
          label="Orders"
          value={totals ? totals.orders.toLocaleString("en-IN") : 0}
          icon={PackageSearch}
          loading={isLoading}
        />
        <StatCard
          label="Active NFC Cards"
          value={cards.filter((c) => c.status === "Active").length}
          icon={CreditCard}
          loading={isLoading}
        />
        <StatCard
          label="Unread Notifications"
          value={unreadQuery.data?.pagination?.count ?? 0}
          icon={Bell}
          loading={isLoading}
        />
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4 text-primary" />
            NFC Taps — Last 30 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tapsSeriesQuery.isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : series.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No taps recorded yet. Once someone taps your card, activity will show up here.
            </p>
          ) : (
            <ChartContainer height={280}>
              <LineChart data={series} margin={{ left: -20, right: 10 }}>
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
          <CardTitle className="text-base">Recent Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !dashboardQuery.data || dashboardQuery.data.recent_notifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <div className="space-y-1">
              {dashboardQuery.data.recent_notifications.map((n) => (
                <div key={n.id} className="flex items-start justify-between gap-3 border-b py-2.5 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    {n.message && <p className="truncate text-xs text-muted-foreground">{n.message}</p>}
                  </div>
                  {!n.is_read && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
