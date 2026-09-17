import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Bell, LogOut, Menu, Search, Settings, UserCircle, X } from "lucide-react"
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
import { ApiError, notificationsApi } from "@/lib/api"
import { formatTimeAgo } from "@/lib/mock-api"
import { cn } from "@/lib/utils"

interface CustomerTopbarProps {
  onMenuClick?: () => void
}

export function CustomerTopbar({ onMenuClick }: CustomerTopbarProps) {
  const navigate = useNavigate()
  const customer = useCustomerAuthStore((s) => s.customer)
  const logout = useCustomerAuthStore((s) => s.logout)
  const [search, setSearch] = useState("")
  const queryClient = useQueryClient()

  // Two queries, one purpose each: the dropdown shows recent notifications
  // regardless of read state (so a read one still appears, dimmed, per the
  // design), while the badge count comes from a dedicated unread-only
  // fetch — the backend's own filtered `pagination.count`, not a count
  // derived from whatever happens to be on the current page of the list.
  const notificationsQuery = useQuery({
    queryKey: ["customer-notifications", "recent"],
    queryFn: () => notificationsApi.list(1, false),
    enabled: Boolean(customer),
  })
  const unreadCountQuery = useQuery({
    queryKey: ["customer-notifications", "unread-count"],
    queryFn: () => notificationsApi.list(1, true),
    enabled: Boolean(customer),
  })
  const notifications = notificationsQuery.data?.items ?? []
  const unreadCount = unreadCountQuery.data?.pagination?.count ?? 0

  function invalidateNotifications() {
    queryClient.invalidateQueries({ queryKey: ["customer-notifications"] })
  }

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markRead({ all: true }),
    onSuccess: invalidateNotifications,
  })
  const markOneReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead({ ids: [id] }),
    onSuccess: invalidateNotifications,
  })

  function friendlyError(err: unknown, fallback: string) {
    return err instanceof ApiError ? err.message : fallback
  }

  const deleteOneMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.delete(id),
    onSuccess: () => {
      invalidateNotifications()
      toast.success("Notification deleted.")
    },
    onError: (err) => toast.error(friendlyError(err, "Couldn't delete that notification. Please try again.")),
  })
  const deleteAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.deleteAllRead(),
    onSuccess: (result) => {
      invalidateNotifications()
      toast.success(
        result.deleted > 0 ? `Cleared ${result.deleted} read notification${result.deleted === 1 ? "" : "s"}.` : "No read notifications to clear."
      )
    },
    onError: (err) => toast.error(friendlyError(err, "Couldn't clear read notifications. Please try again.")),
  })
  const hasReadNotifications = notifications.some((n) => n.is_read)

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
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    onClick={() => markAllReadMutation.mutate()}
                    disabled={markAllReadMutation.isPending}
                  >
                    Mark all read
                  </button>
                )}
                {hasReadNotifications && (
                  <button
                    type="button"
                    className="text-xs font-medium text-muted-foreground hover:text-destructive hover:underline disabled:opacity-50"
                    onClick={() => deleteAllReadMutation.mutate()}
                    disabled={deleteAllReadMutation.isPending}
                  >
                    Delete read
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notificationsQuery.isLoading ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
              ) : (
                notifications.map((n, i) => (
                  <div key={n.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => !n.is_read && markOneReadMutation.mutate(n.id)}
                      className={cn(
                        "flex w-full items-start gap-2.5 px-4 py-3 pr-9 text-left transition-colors hover:bg-accent/50",
                        !n.is_read && "cursor-pointer"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          n.is_read ? "border border-muted-foreground/40" : "bg-primary"
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm leading-snug", n.is_read ? "text-muted-foreground" : "font-medium")}>
                          {n.title}
                        </p>
                        {n.message && <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>}
                        <p className="mt-1 text-[11px] text-muted-foreground">{formatTimeAgo(n.created_at)}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteOneMutation.mutate(n.id)
                      }}
                      disabled={deleteOneMutation.isPending}
                      aria-label="Delete notification"
                      className="absolute right-2.5 top-3 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                    >
                      <X className="size-3.5" />
                    </button>
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
