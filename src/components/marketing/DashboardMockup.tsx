import {
  LayoutDashboard,
  CreditCard,
  UserCircle,
  QrCode,
  BarChart3,
  Activity,
  ShoppingBag,
  Settings,
  MousePointerClick,
  Eye,
  ScanLine,
  BookmarkCheck,
} from "lucide-react"
import { Nfc } from "lucide-react"

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: CreditCard, label: "My Card" },
  { icon: UserCircle, label: "Profile" },
  { icon: QrCode, label: "QR Code" },
  { icon: BarChart3, label: "Analytics" },
  { icon: Activity, label: "Activity" },
  { icon: ShoppingBag, label: "Orders" },
  { icon: Settings, label: "Settings" },
]

const TILES = [
  { icon: MousePointerClick, label: "Total Taps", value: "12,458", delta: "+24.5%", bg: "#4F46E5" },
  { icon: Eye, label: "Profile Views", value: "8,920", delta: "+18.6%", bg: "#7C3AED" },
  { icon: ScanLine, label: "QR Scans", value: "3,538", delta: "+32.7%", bg: "#EC4899" },
  { icon: BookmarkCheck, label: "Contacts Saved", value: "2,450", delta: "+21.4%", bg: "#22C55E" },
]

const LOCATIONS = [
  { name: "India", value: 4320 },
  { name: "United States", value: 2180 },
  { name: "United Kingdom", value: 1240 },
  { name: "Australia", value: 780 },
]

// Static example series purely for the marketing mockup chart.
const CHART_POINTS = [18, 30, 22, 42, 34, 55, 46, 62, 50, 70, 58, 76]

function MiniChart() {
  const w = 420
  const h = 110
  const max = Math.max(...CHART_POINTS)
  const min = Math.min(...CHART_POINTS)
  const range = max - min || 1
  const step = w / (CHART_POINTS.length - 1)
  const linePath = CHART_POINTS.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`).join(" ")
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="dashChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#dashChartFill)" />
      <path d={linePath} fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Fully static, decorative recreation of the customer dashboard for marketing
 * use — mirrors the real sidebar nav / stat cards but uses fixed example
 * numbers rather than any live data. */
export default function DashboardMockup() {
  return (
    <div className="overflow-hidden rounded-[24px] border border-border/70 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] dark:shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
      {/* Browser chrome — deliberately kept as a fixed light-mode screenshot, see note below */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-[#F8FAFC] px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[#EF4444]" />
        <span className="size-2.5 rounded-full bg-[#F59E0B]" />
        <span className="size-2.5 rounded-full bg-[#22C55E]" />
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="hidden w-40 shrink-0 bg-[#0F172A] p-3 sm:block">
          <div className="mb-4 flex items-center gap-2 px-1">
            <span className="flex size-6 items-center justify-center rounded-lg bg-gradient-brand text-white">
              <Nfc className="size-3.5" />
            </span>
            <span className="text-xs font-bold text-white">VR's NEXORA</span>
          </div>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium ${
                  item.active ? "bg-gradient-brand text-white" : "text-slate-400"
                }`}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </div>
            ))}
          </nav>
        </div>

        {/* Main content — a fixed light-mode "product screenshot"; text/border tokens
            below are intentionally pinned to slate rather than theme tokens so this
            keeps reading as a crisp light UI even when the page is in dark mode. */}
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">Welcome back, Alex 👋</p>
              <p className="text-[11px] text-slate-500">Track your growth and engagement</p>
            </div>
            <img
              src="https://api.dicebear.com/9.x/notionists/svg?seed=alex-morgan"
              alt=""
              className="size-8 rounded-full border-2 border-white shadow-sm"
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {TILES.map((t) => (
              <div key={t.label} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                <span
                  className="flex size-6 items-center justify-center rounded-md text-white"
                  style={{ background: t.bg }}
                >
                  <t.icon className="size-3.5" />
                </span>
                <p className="mt-1.5 text-[10px] text-slate-500">{t.label}</p>
                <p className="text-sm font-bold text-slate-900">{t.value}</p>
                <p className="text-[10px] font-semibold text-[#22C55E]">↑ {t.delta}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:col-span-2">
              <p className="text-xs font-semibold text-slate-900">Taps Over Time</p>
              <MiniChart />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-900">Top Locations</p>
              <div className="mt-2.5 space-y-2">
                {LOCATIONS.map((loc) => (
                  <div key={loc.name} className="flex items-center justify-between text-[10px]">
                    <span className="font-medium text-slate-500">{loc.name}</span>
                    <span className="font-semibold text-slate-900">{loc.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
