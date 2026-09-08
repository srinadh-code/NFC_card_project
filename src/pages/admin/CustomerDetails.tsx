import { Link, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, ShoppingBag, IndianRupee, Radio, CreditCard, MapPin, Smartphone } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { StatCard } from "@/components/admin/StatCard"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/mock-api"
import { adminCustomerApi, adminOrderApi, adminTransactionApi, adminAnalyticsApi, ApiError } from "@/lib/api"

export default function AdminCustomerDetails() {
  const { id } = useParams<{ id: string }>()

  const {
    data: customer,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-customer", id],
    queryFn: () => adminCustomerApi.get(id ?? ""),
    enabled: !!id,
    retry: false,
  })

  // Neither the orders nor transactions admin endpoints filter by customer
  // id directly — email is unique per customer, so it doubles as the filter.
  const { data: orderPage } = useQuery({
    queryKey: ["admin-customer-orders", customer?.email],
    queryFn: () => adminOrderApi.list({ search: customer?.email }),
    enabled: !!customer?.email,
  })
  const orders = orderPage?.data ?? []

  const { data: transactionPage } = useQuery({
    queryKey: ["admin-customer-transactions", customer?.email],
    queryFn: () => adminTransactionApi.list({ search: customer?.email }),
    enabled: !!customer?.email,
  })
  const transactions = transactionPage?.data ?? []

  const { data: analytics } = useQuery({
    queryKey: ["admin-customer-analytics", id],
    queryFn: () => adminAnalyticsApi.summary({ range: 365, customerId: id }),
    enabled: !!id,
  })

  const totalTaps = analytics?.totalTaps ?? 0
  const totalQrScans = analytics?.qrScans ?? 0
  const totalUniqueVisitors = analytics?.uniqueVisitors ?? 0

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (isError || !customer) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-lg font-semibold">{notFound ? "Customer not found" : "Could not load customer"}</p>
        <p className="text-sm text-muted-foreground">
          {notFound
            ? `We couldn't find a customer with ID "${id}".`
            : error instanceof ApiError
              ? error.message
              : "Something went wrong."}
        </p>
        {!notFound && (
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        )}
        <Link to="/admin/customers" className="text-sm font-medium text-primary hover:underline">
          &larr; Back to Customers
        </Link>
      </div>
    )
  }

  // The admin analytics summary aggregates counts only — it doesn't expose
  // a single "last event" timestamp/location, so this stays unset rather
  // than fabricating one (the JSX below already renders a graceful fallback).
  const lastActivity = null as { date: string; location: string } | null
  const totalOrders = orders.filter((o) => o.status !== "Cancelled").length
  const totalSpent = orders.filter((o) => o.status !== "Cancelled").reduce((s, o) => s + o.total, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/admin/customers" className="hover:text-foreground hover:underline">
          Customers
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">{customer.name}</span>
      </div>

      <Card>
        <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Avatar className="size-16">
            <AvatarImage src={customer.avatar} alt={customer.name} />
            <AvatarFallback>{customer.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{customer.name}</h1>
              <StatusBadge status={customer.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {customer.designation || "—"}
              {customer.company ? ` at ${customer.company}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              {customer.email} • {customer.phone}
            </p>
          </div>
          <div className="text-sm text-muted-foreground sm:text-right">
            <p className="text-xs uppercase tracking-wide">Joined On</p>
            <p className="font-medium text-foreground">{formatDate(customer.joinedOn)}</p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="cards">NFC Cards</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Orders" value={totalOrders} icon={ShoppingBag} />
            <StatCard label="Total Spent" value={formatCurrency(totalSpent)} icon={IndianRupee} />
            <StatCard label="Total Taps" value={totalTaps} icon={Radio} />
            <StatCard label="NFC Cards" value={customer.cardCount} icon={CreditCard} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Recent Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.slice(0, 5).map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.id}</TableCell>
                        <TableCell>{formatCurrency(o.total)}</TableCell>
                        <TableCell>
                          <StatusBadge status={o.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(o.date)}</TableCell>
                      </TableRow>
                    ))}
                    {orders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          No orders yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Customer Statistics</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Taps</span>
                  <span className="font-medium">{totalTaps}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">QR Scans</span>
                  <span className="font-medium">{totalQrScans}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Unique Visitors</span>
                  <span className="font-medium">{totalUniqueVisitors}</span>
                </div>
                <div className="border-t pt-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Smartphone className="size-3.5" /> Last Tap
                  </p>
                  <p className="font-medium">
                    {lastActivity ? formatDateTime(lastActivity.date) : "No activity recorded"}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" /> Location
                  </p>
                  <p className="font-medium">{lastActivity?.location ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Digital Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar className="size-12">
                    <AvatarImage src={customer.avatar} alt={customer.name} />
                    <AvatarFallback>{customer.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{customer.name}</p>
                    <a
                      href={`/u/${customer.username}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      vrsnexora.com/u/{customer.username}
                    </a>
                  </div>
                  <StatusBadge status={customer.profileStatus} className="ml-auto" />
                </div>
                <p className="text-sm text-muted-foreground">{customer.bio || "No bio added yet."}</p>
                <div className="flex flex-wrap gap-2">
                  {customer.socialLinks
                    .filter((l) => l.enabled)
                    .map((l) => (
                      <Badge key={l.platform} variant="soft">
                        {l.platform}
                      </Badge>
                    ))}
                  {customer.socialLinks.every((l) => !l.enabled) && (
                    <span className="text-sm text-muted-foreground">No social links enabled.</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cards">
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Card ID</TableHead>
                    <TableHead>UID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Activated On</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.cards.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.id}</TableCell>
                      <TableCell className="text-muted-foreground">{c.uid}</TableCell>
                      <TableCell>{c.cardType}</TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.activatedOn ? formatDate(c.activatedOn) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {customer.cards.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No cards assigned.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.id}</TableCell>
                      <TableCell>{formatCurrency(o.total)}</TableCell>
                      <TableCell>
                        <StatusBadge status={o.paymentStatus} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={o.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(o.date)}</TableCell>
                    </TableRow>
                  ))}
                  {orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No orders placed yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.id}</TableCell>
                      <TableCell className="text-muted-foreground">{t.orderId}</TableCell>
                      <TableCell>{formatCurrency(t.amount)}</TableCell>
                      <TableCell>{t.method}</TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(t.date)}</TableCell>
                    </TableRow>
                  ))}
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No transactions found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
