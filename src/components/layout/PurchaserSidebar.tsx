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

/** Purchaser Dashboard navigation — orders, payments and delivery only. */
export function PurchaserSidebar({ onNavigate }: PurchaserSidebarProps) {
  const navigate = useNavigate()
  const logout = useCustomerAuthStore((s) => s.logout)
  const isRecipient = useIsRecipient()

  return (
    <div className="flex h-full flex-col bg-[#0F172A] text-white">
      <div className="flex items-center gap-2 px-6 py-5">
        <BrandMark
          className="size-9 rounded-xl shadow-glow-primary"
          fallback={
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow-primary">
              <Zap className="size-5" fill="currentColor" />
            </div>
          }
        />
        <span className="text-lg font-bold tracking-tight text-white">VR's GATEWAY</span>
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

      <div className="space-y-1 border-t border-white/10 p-3">
        <NavLink
          to="/shop"
          onClick={onNavigate}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-[#1E293B] hover:text-white"
        >
          <ShoppingCart className="size-4.5" />
          Order More Cards
        </NavLink>
        {/* Same login, second dashboard — only for accounts that also hold a card. */}
        {isRecipient && (
          <NavLink
            to="/dashboard"
            onClick={onNavigate}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-amber-300 transition-colors hover:bg-[#1E293B] hover:text-amber-200"
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
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-[#1E293B] hover:text-red-400"
        >
          <LogOut className="size-4.5" />
          Logout
        </button>
      </div>
    </div>
  )
}
