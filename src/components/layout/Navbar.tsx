import { useEffect, useState } from "react"
import { Link, NavLink, useNavigate } from "react-router-dom"
import { LayoutDashboard, LogOut, Menu, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCartStore } from "@/store/cart-store"
import { useCustomerAuthStore } from "@/store/auth-store"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/features", label: "Features" },
  { to: "/shop", label: "Order Card" },
  { to: "/how-it-works", label: "How It Works" },
]

const ORDER_BUTTON_GRADIENT = "linear-gradient(135deg, #5B4DFF 0%, #7C3AED 50%, #EC4899 100%)"

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      {/* Luxury coin emblem */}
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-[#0B0B0F] ring-2 ring-[#D4AF37]/70">
        <span className="absolute inset-[3px] rounded-full border border-[#D4AF37]/40" />
        <span className="relative font-serif text-lg font-bold text-[#D4AF37]">N</span>
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-lg font-bold tracking-tight text-foreground">VR's NEXORA</span>
        <span className="mt-1 text-[11px] font-medium text-muted-foreground">Digital Identity</span>
      </span>
    </Link>
  )
}

export default function Navbar() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const itemCount = useCartStore((s) => s.lines.reduce((sum, l) => sum + l.qty, 0))
  // Reflects the REAL, token-backed customer session (see hasValidSession
  // in auth-store.ts) — this is what previously always showed "Login" even
  // to an already-authenticated customer, which is exactly the kind of
  // mismatch between displayed UI state and actual auth state that made a
  // real session look like a logged-out one.
  const customer = useCustomerAuthStore((s) => s.customer)
  const logout = useCustomerAuthStore((s) => s.logout)

  const initials = customer?.name
    ? customer.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U"

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div className="sticky top-0 z-50 w-full px-3 pt-5 sm:px-4">
      {/* Premium floating glass navbar */}
      <header
        className={cn(
          "relative mx-auto max-w-[1440px] overflow-hidden rounded-[24px] transition-all duration-[350ms] ease-in-out",
          scrolled ? "backdrop-blur-[16px] shadow-[0_14px_46px_rgba(124,58,237,0.12)]" : "backdrop-blur-[12px] shadow-[0_10px_40px_rgba(124,58,237,0.08)]",
        )}
        style={{
          background: "rgba(255,255,255,0.95)",
          border: "1px solid rgba(124,58,237,0.08)",
        }}
      >
        {/* Ambient purple glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: "radial-gradient(circle at center, rgba(124,58,237,0.08), transparent 70%)" }}
        />

        <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 sm:px-6 lg:px-10">
          <Logo />

          <nav className="hidden items-center gap-2 lg:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "group relative rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors duration-300 hover:text-primary",
                    isActive && "text-primary",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {link.label}
                    <span
                      className={cn(
                        "pointer-events-none absolute inset-x-4 -bottom-0.5 h-0.5 origin-left scale-x-0 rounded-full bg-gradient-brand transition-transform duration-300 group-hover:scale-x-100",
                        isActive && "scale-x-100",
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Button
              variant="ghost"
              size="icon"
              className="relative text-muted-foreground hover:bg-primary/10 hover:text-primary"
              onClick={() => navigate("/cart")}
              aria-label="Cart"
            >
              <ShoppingCart className="size-5" />
              {itemCount > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4.5 min-w-4.5 items-center justify-center rounded-full bg-gradient-brand px-1 text-[10px] font-semibold text-white">
                  {itemCount}
                </span>
              )}
            </Button>
            {customer ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full outline-none ring-primary/40 focus-visible:ring-2">
                    <Avatar className="size-9">
                      <AvatarImage src={customer.avatar} alt={customer.name} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <p className="truncate text-sm font-medium">{customer.name}</p>
                    <p className="truncate text-xs font-normal text-muted-foreground">{customer.email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                    <LayoutDashboard />
                    My Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      logout()
                      navigate("/")
                    }}
                  >
                    <LogOut />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                to="/login"
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-300 hover:bg-primary/5 hover:text-primary"
              >
                Login
              </Link>
            )}
            <Button
              variant="gradient"
              className="rounded-full px-6 shadow-[0_8px_24px_rgba(124,58,237,0.28)] transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_10px_32px_rgba(124,58,237,0.4)]"
              style={{ background: ORDER_BUTTON_GRADIENT }}
              onClick={() => navigate("/shop")}
            >
              Order Now →
            </Button>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="relative text-muted-foreground hover:bg-primary/10 hover:text-primary"
              onClick={() => navigate("/cart")}
              aria-label="Cart"
            >
              <ShoppingCart className="size-5" />
              {itemCount > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4.5 min-w-4.5 items-center justify-center rounded-full bg-gradient-brand px-1 text-[10px] font-semibold text-white">
                  {itemCount}
                </span>
              )}
            </Button>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-primary/10 hover:text-primary" aria-label="Menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 border-l border-border bg-white">
                <SheetHeader>
                  <SheetTitle>
                    <Logo />
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 px-4">
                  {NAV_LINKS.map((link) => (
                    <SheetClose asChild key={link.to}>
                      <NavLink
                        to={link.to}
                        end={link.to === "/"}
                        className={({ isActive }) =>
                          cn(
                            "rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-300 hover:bg-primary/10 hover:text-primary",
                            isActive && "bg-primary/10 text-primary",
                          )
                        }
                      >
                        {link.label}
                      </NavLink>
                    </SheetClose>
                  ))}
                  {customer ? (
                    <>
                      <SheetClose asChild>
                        <NavLink
                          to="/dashboard"
                          className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-300 hover:bg-primary/10 hover:text-primary"
                        >
                          My Dashboard
                        </NavLink>
                      </SheetClose>
                      <SheetClose asChild>
                        <button
                          type="button"
                          onClick={() => {
                            logout()
                            navigate("/")
                          }}
                          className="rounded-md px-3 py-2.5 text-left text-sm font-medium text-destructive transition-colors duration-300 hover:bg-destructive/10"
                        >
                          Logout
                        </button>
                      </SheetClose>
                    </>
                  ) : (
                    <SheetClose asChild>
                      <NavLink
                        to="/login"
                        className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-300 hover:bg-primary/10 hover:text-primary"
                      >
                        Login
                      </NavLink>
                    </SheetClose>
                  )}
                </nav>
                <div className="mt-auto px-4 pb-4">
                  <SheetClose asChild>
                    <Button
                      variant="gradient"
                      className="w-full rounded-full transition-transform duration-300 hover:scale-[1.03]"
                      style={{ background: ORDER_BUTTON_GRADIENT }}
                      onClick={() => navigate("/shop")}
                    >
                      Order Now
                    </Button>
                  </SheetClose>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </div>
  )
}
