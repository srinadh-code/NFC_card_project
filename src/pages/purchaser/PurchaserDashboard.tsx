import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, CreditCard, IndianRupee, MapPin, Package, PackageSearch, ShoppingCart, Truck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { ErrorState } from "@/components/customer/ErrorState"
import { useCustomerAuthStore } from "@/store/auth-store"
import { ordersApi, toFrontendOrder } from "@/lib/api"
import { customerOrderKeys } from "@/lib/customer-order-queries"
import { formatCurrency, formatDate } from "@/lib/mock-api"
import type { Order } from "@/types"

const CLOSED_STATUSES = new Set(["Delivered", "Completed", "Cancelled"])

function cardCount(order: Order) {
  return order.items.reduce((sum, item) => sum + item.qty, 0)
}

function recipientSummary(order: Order) {
  const names = (order.recipients ?? []).map((r) => r.name).filter(Boolean)
  if (names.length === 0) return null
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`
}

/** Purchaser Dashboard overview: what was bought, what was paid, and where
 *  each order is — built only from the buyer's own orders. */
export default function PurchaserDashboard() {
  const customer = useCustomerAuthStore((s) => s.customer)
  // Same query (and cache) as My Orders' first page.
  const ordersQuery = useQuery({
    queryKey: customerOrderKeys.page(customer?.id, 1),
    queryFn: () => ordersApi.list(1),
    enabled: Boolean(customer),
  })

  const orders = (ordersQuery.data?.items ?? []).map(toFrontendOrder)
  const live = orders.filter((o) => o.status !== "Cancelled")
  const stats = [
    { label: "Total Orders", value: String(orders.length), icon: Package },
    { label: "Cards Purchased", value: String(live.reduce((sum, o) => sum + cardCount(o), 0)), icon: CreditCard },
    {
      label: "Amount Paid",
      value: formatCurrency(orders.filter((o) => o.paymentStatus === "Paid").reduce((sum, o) => sum + o.total, 0)),
      icon: IndianRupee,
    },
    { label: "Orders In Progress", value: String(orders.filter((o) => !CLOSED_STATUSES.has(o.status)).length), icon: Truck },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Welcome{customer?.name ? `, ${customer.name}` : ""}</h1>
          <p className="text-sm text-muted-foreground">
            Track the NFC cards you have purchased, their payments and delivery.
          </p>
        </div>
        <Button asChild>
          <Link to="/shop">
            <ShoppingCart /> Order More Cards
          </Link>
        </Button>
      </div>

      {ordersQuery.isError ? (
        <ErrorState error={ordersQuery.error} onRetry={() => ordersQuery.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((stat) => {
              const card = (
                <Card key={stat.label} className="rounded-2xl">
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                      <stat.icon className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs text-muted-foreground">{stat.label}</p>
                      {ordersQuery.isLoading ? (
                        <Skeleton className="mt-1 h-6 w-16" />
                      ) : (
                        <p className="truncate text-lg font-bold">{stat.value}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
              return stat.label === "Total Orders" ? (
                <Link
                  key={stat.label}
                  to="/purchaser/orders"
                  className="rounded-2xl transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {card}
                </Link>
              ) : card
            })}
          </div>

          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">Recent Orders</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/purchaser/orders">
                  View all <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {ordersQuery.isLoading ? (
                Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
              ) : orders.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <PackageSearch className="size-10 text-muted-foreground" />
                  <p className="font-medium">No orders yet</p>
                  <p className="text-sm text-muted-foreground">Cards you buy will appear here.</p>
                </div>
              ) : (
                orders.slice(0, 5).map((order) => {
                  const recipients = recipientSummary(order)
                  return (
                    <div
                      key={order.id}
                      className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="font-semibold">{order.orderNumber ?? `Order ${order.id}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(order.date)} · {cardCount(order)} {cardCount(order) === 1 ? "card" : "cards"}
                          {recipients ? ` · For ${recipients}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <StatusBadge status={order.status} />
                        <StatusBadge status={order.paymentStatus} />
                        <span className="text-sm font-semibold">{formatCurrency(order.total)}</span>
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/purchaser/orders?order=${order.id}`}>View Details</Link>
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { to: "/purchaser/orders", title: "Track Orders", text: "Delivery progress and invoices for every order.", icon: Truck },
              { to: "/purchaser/addresses", title: "Delivery Addresses", text: "Manage where your cards are shipped.", icon: MapPin },
              { to: "/track-order", title: "Track by Order ID", text: "Look up an order with its tracking link.", icon: PackageSearch },
            ].map((link) => (
              <Link key={link.to} to={link.to} className="group">
                <Card className="h-full rounded-2xl transition-colors group-hover:border-amber-300">
                  <CardContent className="flex items-start gap-3 p-4">
                    <link.icon className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
                    <div>
                      <p className="font-medium">{link.title}</p>
                      <p className="text-sm text-muted-foreground">{link.text}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
