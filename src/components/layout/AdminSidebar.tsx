import { NavLink, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  Users,
  Nfc,
  ShoppingCart,
  Wallet,
  UserCircle,
  BarChart3,
  FileText,
  Settings,
  LifeBuoy,
  LogOut,
  Zap,
  Newspaper,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAdminAuthStore } from "@/store/auth-store"

const NAV_ITEMS = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/cards", label: "NFC Cards", icon: Nfc },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { to: "/admin/transactions", label: "Transactions", icon: Wallet },
  { to: "/admin/profiles", label: "Profiles", icon: UserCircle },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/reports", label: "Reports", icon: FileText },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/support", label: "Support", icon: LifeBuoy },
  // { to: "/admin/content", label: "Website Content", icon: Newspaper },
]

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const logout = useAdminAuthStore((s) => s.logout)

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Zap className="size-4.5" />
        </div>
        <span className="text-lg font-semibold tracking-tight">VR's NEXORA</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )
            }
          >
            <item.icon className="size-4.5 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-3">
        <button
          onClick={() => {
            logout()
            onNavigate?.()
            navigate("/login")
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-4.5 shrink-0" />
          Logout
        </button>
      </div>
    </div>
  )
}
