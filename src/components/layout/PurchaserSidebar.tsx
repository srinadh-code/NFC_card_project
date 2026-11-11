import { NavLink, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquareQuote,
  Package,
  Settings,
  ShoppingCart,
  UserCircle,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCustomerAuthStore, useIsRecipient } from "@/store/auth-store"
import { BrandMark } from "@/components/layout/BrandMark"

const NAV_ITEMS = [
  { to: "/purchaser", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/purchaser/orders", label: "My Orders", icon: Package },
  { to: "/purchaser/addresses", label: "Delivery Addresses", icon: MapPin },
  { to: "/purchaser/testimonials", label: "My Testimonials", icon: MessageSquareQuote },
  { to: "/purchaser/settings", label: "Account Settings", icon: Settings },
]

interface PurchaserSidebarProps {
  onNavigate?: () => void
}

/** Purchaser Dashboard navigation — orders, payments and delivery only; no
 *  digital-profile features. Deliberately light, unlike the dark Customer
 *  Dashboard sidebar, so the two dashboards are never confused. */
export function PurchaserSidebar({ onNavigate }: PurchaserSidebarProps) {
  const navigate = useNavigate()
  const logout = useCustomerAuthStore((s) => s.logout)
  const isRecipient = useIsRecipient()

  return (
    <div className="flex h-full flex-col border-r bg-card text-foreground">
      <div className="px-6 py-5">
        <div className="flex items-center gap-2">
          <BrandMark
            className="size-9 rounded-xl"
            fallback={
              <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-brand text-white">
                <Zap className="size-5" fill="currentColor" />
              </div>
            }
          />
          <span className="text-lg font-bold tracking-tight">VR's GATEWAY</span>
        </div>
        <span className="mt-3 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
          Purchaser Dashboard
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Purchaser Dashboard">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            <item.icon className="size-4.5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-1 border-t p-3">
        <NavLink
          to="/shop"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ShoppingCart className="size-4.5" />
          Order More Cards
        </NavLink>
        {/* Same login, second dashboard — only for accounts that also hold a card. */}
        {isRecipient && (
          <NavLink
            to="/dashboard"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <UserCircle className="size-4.5" />
            Switch to Customer Dashboard
          </NavLink>
        )}
        <button
          type="button"
          onClick={() => {
            logout()
            navigate("/login")
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="size-4.5" />
          Logout
        </button>
      </div>
    </div>
  )
}
