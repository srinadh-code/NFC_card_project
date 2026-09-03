import { useState } from "react"
import { Link, NavLink, useNavigate } from "react-router-dom"
import { Menu, Nfc, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet"
import { useCartStore } from "@/store/cart-store"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/features", label: "Features" },
  { to: "/shop", label: "Order Card" },
  { to: "/how-it-works", label: "How It Works" },
]

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow-primary">
        <Nfc className="size-5" />
      </span>
      <span className="text-lg font-bold tracking-tight text-foreground">
        TapLink
      </span>
    </Link>
  )
}

export default function Navbar() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const itemCount = useCartStore((s) => s.lines.reduce((sum, l) => sum + l.qty, 0))

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                cn(
                  "group relative rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground",
                  isActive && "text-primary",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {link.label}
                  <span
                    className={cn(
                      "pointer-events-none absolute inset-x-3 -bottom-0.5 h-0.5 origin-left scale-x-0 rounded-full bg-gradient-brand transition-transform duration-200 group-hover:scale-x-100",
                      isActive && "scale-x-100",
                    )}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:bg-accent hover:text-primary"
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
          <Link to="/login" className="px-3 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground">
            Login
          </Link>
          <Button variant="gradient" onClick={() => navigate("/shop")}>
            Order Now →
          </Button>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:bg-accent hover:text-primary"
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
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-accent hover:text-primary" aria-label="Menu">
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
                          "rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground",
                          isActive && "bg-primary/10 text-primary",
                        )
                      }
                    >
                      {link.label}
                    </NavLink>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <NavLink
                    to="/login"
                    className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
                  >
                    Login
                  </NavLink>
                </SheetClose>
              </nav>
              <div className="mt-auto px-4 pb-4">
                <SheetClose asChild>
                  <Button variant="gradient" className="w-full" onClick={() => navigate("/shop")}>
                    Order Now
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
