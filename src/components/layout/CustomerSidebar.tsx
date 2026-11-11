import { NavLink, useNavigate } from "react-router-dom"
import {
  Activity,
  BarChart3,
  Briefcase,
  CreditCard,
  Inbox,
  LayoutDashboard,
  Link2,
  LogOut,
  MapPin,
  MessageSquareQuote,
  QrCode,
  Settings,
  ShoppingBag,
  UserCircle,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCustomerAuthStore, useIsPurchaser, useIsRecipient } from "@/store/auth-store"
import { BrandMark } from "@/components/layout/BrandMark"

// recipientOnly: Customer Dashboard / digital-profile pages, hidden for a
// purchaser-only account (the routes themselves are guarded in App.tsx).
const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, recipientOnly: true },
  { to: "/my-card", label: "My Card", icon: CreditCard, recipientOnly: true },
  { to: "/profile", label: "My Profile", icon: UserCircle, recipientOnly: true },
  { to: "/services", label: "Services", icon: Briefcase, recipientOnly: true },
  { to: "/social-links", label: "Social Links", icon: Link2, recipientOnly: true },
  { to: "/qr-code", label: "QR Code", icon: QrCode, recipientOnly: true },
  { to: "/analytics", label: "Analytics", icon: BarChart3, recipientOnly: true },
  { to: "/enquiries", label: "Enquiries", icon: Inbox, recipientOnly: true },
  { to: "/activity", label: "Activity", icon: Activity, recipientOnly: true },
  { to: "/orders", label: "Orders", icon: ShoppingBag },
  { to: "/addresses", label: "Addresses", icon: MapPin },
  { to: "/testimonials", label: "My Testimonials", icon: MessageSquareQuote },
  { to: "/settings", label: "Settings", icon: Settings },
]

interface CustomerSidebarProps {
  onNavigate?: () => void
}

export function CustomerSidebar({ onNavigate }: CustomerSidebarProps) {
  const navigate = useNavigate()
  const logout = useCustomerAuthStore((s) => s.logout)
  const isRecipient = useIsRecipient()
  // Same login, second dashboard — for accounts that also bought cards.
  const isPurchaser = useIsPurchaser()
  const navItems = NAV_ITEMS.filter((item) => isRecipient || !("recipientOnly" in item && item.recipientOnly))

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

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {navItems.map((item) => (
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

      <div className="space-y-1 border-t border-white/10 p-3">
        {isPurchaser && (
          <NavLink
            to="/purchaser"
            onClick={onNavigate}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-amber-300 transition-colors hover:bg-[#1E293B] hover:text-amber-200"
          >
            <ShoppingBag className="size-4.5" />
            Switch to Purchaser Dashboard
          </NavLink>
        )}
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
