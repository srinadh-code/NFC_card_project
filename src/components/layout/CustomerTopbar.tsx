import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, LogOut, Menu, Search, Settings, UserCircle } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useCustomerAuthStore } from "@/store/auth-store"

const NOTIFICATIONS = [
  {
    id: 1,
    title: "Your card was tapped 5 times today",
    detail: "Keep sharing your profile to reach more people.",
  },
  {
    id: 2,
    title: "New feature: QR download is live",
    detail: "You can now download your profile QR code as an image.",
  },
  {
    id: 3,
    title: "Weekly summary is ready",
    detail: "Check your Analytics page for this week's performance.",
  },
]

interface CustomerTopbarProps {
  onMenuClick?: () => void
}

export function CustomerTopbar({ onMenuClick }: CustomerTopbarProps) {
  const navigate = useNavigate()
  const customer = useCustomerAuthStore((s) => s.customer)
  const logout = useCustomerAuthStore((s) => s.logout)
  const [search, setSearch] = useState("")

  const initials = customer?.name
    ? customer.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U"

  return (
    <header className="flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick} aria-label="Open menu">
        <Menu className="size-5" />
      </Button>

      <div className="relative hidden max-w-sm flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search anything..."
          className="pl-9"
        />
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="size-5" />
              <Badge className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full p-0 text-[10px]">
                {NOTIFICATIONS.length}
              </Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {NOTIFICATIONS.map((n, i) => (
                <div key={n.id}>
                  <div className="px-4 py-3">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{n.detail}</p>
                  </div>
                  {i < NOTIFICATIONS.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full outline-none ring-primary/40 focus-visible:ring-2">
              <Avatar className="size-9">
                <AvatarImage src={customer?.avatar} alt={customer?.name ?? "User"} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="truncate text-sm font-medium">{customer?.name}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{customer?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")}>
              <UserCircle />
              My Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                logout()
                navigate("/login")
              }}
            >
              <LogOut />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
