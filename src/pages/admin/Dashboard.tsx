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
import { adminDashboardApi, adminAnalyticsApi } from "@/lib/api"
import { formatCurrency, formatDate } from "@/lib/mock-api"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const PIE_COLORS = ["#22c55e", "#6366f1", "#f59e0b"]

export default function AdminDashboard() {
  const navigate = useNavigate()

  const [monthFilter, setMonthFilter] = useState(String(new Date().getMonth()))

  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => adminDashboardApi.get(),
  })

  // The month picker predates the real analytics endpoint (which only
  // exposes a rolling "last N days" range, not an arbitrary calendar
  // month) — map the selected month to a day count so the picker still
  // does something meaningful against the real API.
  const rangeDays = useMemo(() => {
    const monthIdx = Number(monthFilter)
    const now = new Date()
    const isCurrentMonth = monthIdx === now.getMonth()
    if (isCurrentMonth) return now.getDate()
    const daysInMonth = new Date(now.getFullYear(), monthIdx + 1, 0).getDate()
    return daysInMonth
  }, [monthFilter])

  const { data: analytics } = useQuery({
    queryKey: ["admin-dashboard-analytics", rangeDays],
    queryFn: () => adminAnalyticsApi.summary({ range: rangeDays }),
  })

  const tapsChartData = useMemo(() => {
    if (!analytics) return []
    return analytics.byDay.map((d) => ({
      day: new Date(d.date).getDate(),
      taps: d.count,
    }))
  }, [analytics])

  const platformData = useMemo(() => {
    if (!analytics) return []
    const total = analytics.byDevice.reduce((s, d) => s + d.count, 0)
    return analytics.byDevice.map((d) => ({
      name: d.device,
      value: d.count,
      pct: total > 0 ? (d.count / total) * 100 : 0,
    }))
  }, [analytics])

  const recentActivity = stats?.recentOrders ?? []

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
        <p className="text-sm text-muted-foreground">Overview of your VR's NEXORA platform</p>
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
