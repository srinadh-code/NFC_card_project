import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  Users,
  UserCheck,
  CreditCard,
  Nfc,
  IndianRupee,
  ShoppingCart,
  Clock,
  CalendarClock,
} from "lucide-react"
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Pie,
  PieChart,
  Cell,
  Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChartContainer } from "@/components/ui/chart-container"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { StatCard } from "@/components/admin/StatCard"
import { useDataStore } from "@/store/data-store"
import { simulateLatency, formatCurrency, formatDate } from "@/lib/mock-api"
import { analyticsRecords } from "@/data/seed"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const PIE_COLORS = ["#22c55e", "#6366f1", "#f59e0b"]

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const customers = useDataStore((s) => s.customers)
  const cards = useDataStore((s) => s.cards)
  const orders = useDataStore((s) => s.orders)

  const [monthFilter, setMonthFilter] = useState(String(new Date().getMonth()))

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard", customers.length, cards.length, orders.length],
    queryFn: () =>
      simulateLatency({ customers, cards, orders }, 300),
  })

  const stats = useMemo(() => {
    if (!data) return null
    const { customers, cards, orders } = data

    const activeCustomers = customers.filter((c) => c.status === "Active").length
    const activatedCards = cards.filter((c) => c.status === "Active").length
    const nonCancelled = orders.filter((o) => o.status !== "Cancelled")
    const totalRevenue = nonCancelled.reduce((s, o) => s + o.total, 0)
    const pendingOrders = orders.filter((o) => o.status === "Pending").length

    const todayKey = new Date().toISOString().slice(0, 10)
    let todayOrders = orders.filter((o) => o.date.slice(0, 10) === todayKey)
    if (todayOrders.length === 0 && orders.length > 0) {
      const latestDay = [...orders].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )[0].date.slice(0, 10)
      todayOrders = orders.filter((o) => o.date.slice(0, 10) === latestDay)
    }
    const todaysRevenue = todayOrders
      .filter((o) => o.status !== "Cancelled")
      .reduce((s, o) => s + o.total, 0)

    // Data-driven trend: last 30 days vs previous 30 days.
    const cutoff30 = daysAgo(30)
    const cutoff60 = daysAgo(60)
    const ordersLast30 = orders.filter((o) => new Date(o.date) >= cutoff30).length
    const ordersPrev30 = orders.filter(
      (o) => new Date(o.date) >= cutoff60 && new Date(o.date) < cutoff30,
    ).length
    const orderTrend =
      ordersPrev30 === 0 ? (ordersLast30 > 0 ? 100 : 0) : ((ordersLast30 - ordersPrev30) / ordersPrev30) * 100

    const customersLast30 = customers.filter((c) => new Date(c.joinedOn) >= cutoff30).length
    const customersPrev30 = customers.filter(
      (c) => new Date(c.joinedOn) >= cutoff60 && new Date(c.joinedOn) < cutoff30,
    ).length
    const customerTrend =
      customersPrev30 === 0
        ? (customersLast30 > 0 ? 100 : 0)
        : ((customersLast30 - customersPrev30) / customersPrev30) * 100

    const revenueLast30 = nonCancelled
      .filter((o) => new Date(o.date) >= cutoff30)
      .reduce((s, o) => s + o.total, 0)
    const revenuePrev30 = nonCancelled
      .filter((o) => new Date(o.date) >= cutoff60 && new Date(o.date) < cutoff30)
      .reduce((s, o) => s + o.total, 0)
    const revenueTrend =
      revenuePrev30 === 0 ? (revenueLast30 > 0 ? 100 : 0) : ((revenueLast30 - revenuePrev30) / revenuePrev30) * 100

    const cardsLast30 = cards.filter(
      (c) => c.activatedOn && new Date(c.activatedOn) >= cutoff30,
    ).length
    const cardsPrev30 = cards.filter(
      (c) =>
        c.activatedOn &&
        new Date(c.activatedOn) >= cutoff60 &&
        new Date(c.activatedOn) < cutoff30,
    ).length
    const cardTrend =
      cardsPrev30 === 0 ? (cardsLast30 > 0 ? 100 : 0) : ((cardsLast30 - cardsPrev30) / cardsPrev30) * 100

    return {
      totalCustomers: customers.length,
      activeCustomers,
      totalCards: cards.length,
      activatedCards,
      totalRevenue,
      totalOrders: orders.length,
      pendingOrders,
      todaysRevenue,
      orderTrend,
      customerTrend,
      revenueTrend,
      cardTrend,
    }
  }, [data])

  const tapsChartData = useMemo(() => {
    const monthIdx = Number(monthFilter)
    const now = new Date()
    const year = now.getFullYear()
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
    const byDay = new Map<number, number>()
    for (const rec of analyticsRecords) {
      const d = new Date(rec.date)
      if (d.getMonth() === monthIdx && d.getFullYear() === year) {
        byDay.set(d.getDate(), (byDay.get(d.getDate()) ?? 0) + rec.taps)
      }
    }
    return Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      taps: byDay.get(i + 1) ?? 0,
    }))
  }, [monthFilter])

  const platformData = useMemo(() => {
    const monthIdx = Number(monthFilter)
    const now = new Date()
    const year = now.getFullYear()
    const byDevice = new Map<string, number>()
    let total = 0
    for (const rec of analyticsRecords) {
      const d = new Date(rec.date)
      if (d.getMonth() === monthIdx && d.getFullYear() === year) {
        byDevice.set(rec.device, (byDevice.get(rec.device) ?? 0) + rec.taps)
        total += rec.taps
      }
    }
    if (total === 0) {
      // fall back to all-time distribution so the chart isn't empty for older months
      for (const rec of analyticsRecords) {
        byDevice.set(rec.device, (byDevice.get(rec.device) ?? 0) + rec.taps)
        total += rec.taps
      }
    }
    return Array.from(byDevice.entries()).map(([device, taps]) => ({
      name: device,
      value: taps,
      pct: total > 0 ? (taps / total) * 100 : 0,
    }))
  }, [monthFilter])

  const recentActivity = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6)
  }, [orders])

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your TapLink platform</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Customers"
          value={stats.totalCustomers}
          icon={Users}
          trend={{ value: stats.customerTrend }}
        />
        <StatCard
          label="Active Customers"
          value={stats.activeCustomers}
          icon={UserCheck}
          trend={{ value: stats.customerTrend }}
        />
        <StatCard label="Total Cards Sold" value={stats.totalCards} icon={CreditCard} trend={{ value: stats.cardTrend }} />
        <StatCard
          label="Activated Cards"
          value={stats.activatedCards}
          icon={Nfc}
          trend={{ value: stats.cardTrend }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          icon={IndianRupee}
          trend={{ value: stats.revenueTrend }}
        />
        <StatCard
          label="Total Orders"
          value={stats.totalOrders}
          icon={ShoppingCart}
          trend={{ value: stats.orderTrend }}
        />
        <StatCard label="Pending Orders" value={stats.pendingOrders} icon={Clock} />
        <StatCard label="Today's Revenue" value={formatCurrency(stats.todaysRevenue)} icon={CalendarClock} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Taps Overview</CardTitle>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, idx) => (
                  <SelectItem key={m} value={String(idx)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <ChartContainer>
              <LineChart data={tapsChartData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid var(--border)" }}
                  labelFormatter={(d) => `Day ${d}`}
                />
                <Line
                  type="monotone"
                  dataKey="taps"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Platforms</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer height={260}>
              <PieChart>
                <Pie
                  data={platformData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {platformData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, _name, item) => {
                    const payload = item?.payload as { pct: number; name: string } | undefined
                    return [
                      `${value} taps (${(payload?.pct ?? 0).toFixed(1)}%)`,
                      payload?.name ?? "",
                    ]
                  }}
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid var(--border)" }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value: string) => <span className="text-xs">{value}</span>}
                />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {recentActivity.map((order) => (
            <button
              key={order.id}
              onClick={() => navigate("/admin/orders")}
              className="flex items-center justify-between gap-3 py-3 text-left first:pt-0 last:pb-0 hover:opacity-80"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {order.customerName} placed order {order.id}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(order.date)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{formatCurrency(order.total)}</span>
                <StatusBadge status={order.status} />
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
