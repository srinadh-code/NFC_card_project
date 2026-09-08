import { NavLink, useNavigate } from "react-router-dom"
import {
  Activity,
  BarChart3,
  Briefcase,
  CreditCard,
  LayoutDashboard,
  Link2,
  LogOut,
  QrCode,
  Settings,
  ShoppingBag,
  UserCircle,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCustomerAuthStore } from "@/store/auth-store"

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/my-card", label: "My Card", icon: CreditCard },
  { to: "/profile", label: "My Profile", icon: UserCircle },
  { to: "/services", label: "Services", icon: Briefcase },
  { to: "/social-links", label: "Social Links", icon: Link2 },
  { to: "/qr-code", label: "QR Code", icon: QrCode },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/orders", label: "Orders", icon: ShoppingBag },
  { to: "/settings", label: "Settings", icon: Settings },
]

interface CustomerSidebarProps {
  onNavigate?: () => void
}

export function CustomerSidebar({ onNavigate }: CustomerSidebarProps) {
  const navigate = useNavigate()
  const logout = useCustomerAuthStore((s) => s.logout)

  return (
    <div className="flex h-full flex-col bg-[#0F172A] text-white">
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow-primary">
          <Zap className="size-5" fill="currentColor" />
        </div>
        <span className="text-lg font-bold tracking-tight text-white">VR's NEXORA</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gradient-brand text-white shadow-glow-primary"
                  : "text-slate-300 hover:bg-[#1E293B] hover:text-white",
              )
            }
          >
            <item.icon className="size-4.5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          onClick={() => {
            logout()
            navigate("/login")
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-[#1E293B] hover:text-red-400"
        >
          <LogOut className="size-4.5" />
          Logout
        </button>
      </div>
    </div>
  )
}
