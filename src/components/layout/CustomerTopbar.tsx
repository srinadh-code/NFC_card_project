import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, LogOut, Menu, Search, Settings, UserCircle } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
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
import { notificationsApi } from "@/lib/api"

interface CustomerTopbarProps {
  onMenuClick?: () => void
}

export function CustomerTopbar({ onMenuClick }: CustomerTopbarProps) {
  const navigate = useNavigate()
  const customer = useCustomerAuthStore((s) => s.customer)
  const logout = useCustomerAuthStore((s) => s.logout)
  const [search, setSearch] = useState("")
  const queryClient = useQueryClient()

  const notificationsQuery = useQuery({
    queryKey: ["customer-notifications", "unread"],
    queryFn: () => notificationsApi.list(1, true),
    enabled: Boolean(customer),
  })
  const notifications = notificationsQuery.data?.items ?? []
  const unreadCount = notificationsQuery.data?.pagination?.count ?? 0

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markRead({ all: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer-notifications"] }),
  })

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
              {unreadCount > 0 && (
                <Badge className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full p-0 text-[10px]">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              {notifications.length > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notificationsQuery.isLoading ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications.</p>
              ) : (
                notifications.map((n, i) => (
                  <div key={n.id}>
                    <div className="px-4 py-3">
                      <p className="text-sm font-medium leading-snug">{n.title}</p>
                      {n.message && <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>}
                    </div>
                    {i < notifications.length - 1 && <Separator />}
                  </div>
                ))
              )}
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
