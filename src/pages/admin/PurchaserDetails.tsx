import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, CreditCard, Eye, IndianRupee, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OrderRecipientsTable } from "@/components/admin/OrderRecipientsTable"
import { StatCard } from "@/components/admin/StatCard"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { ApiError } from "@/lib/api"
import { adminPurchaserApi } from "@/lib/purchasers-api"
import { formatCurrency, formatDate } from "@/lib/mock-api"

export default function AdminPurchaserDetails() {
  const { id } = useParams<{ id: string }>()
  const [orderId, setOrderId] = useState<string | null>(null)
  const { data: buyer, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-purchaser", id], queryFn: () => adminPurchaserApi.get(id ?? ""), enabled: !!id, retry: false,
  })
  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-32 w-full" /><Skeleton className="h-80 w-full" /></div>
  if (isError || !buyer) return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-xl font-semibold">{error instanceof ApiError && error.status === 404 ? "Purchaser not found" : "Unable to load purchaser"}</h1>
      <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Please try again."}</p>
      <Button variant="outline" onClick={() => refetch()}>Retry</Button>
      <Link className="text-sm text-primary hover:underline" to="/admin/purchasers">Back to Purchasers</Link>
    </div>
  )
  const selected = buyer.orders.find((order) => order.id === orderId)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link className="hover:underline" to="/admin/purchasers">Purchasers</Link><ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">{buyer.name || buyer.email}</span>
      </div>
      <Card><CardContent className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{buyer.name || buyer.email}</h1>
        <p className="break-all text-sm text-muted-foreground">{buyer.email}</p>
        <p className="text-sm text-muted-foreground">{buyer.phone || "Phone not recorded"}</p>
      </CardContent></Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Successful Orders" value={buyer.paidOrderCount} icon={ShoppingBag} />
        <StatCard label="Cards Purchased" value={buyer.totalCardsPurchased} icon={CreditCard} />
        <StatCard label="Total Paid" value={formatCurrency(buyer.totalAmountPaid)} icon={IndianRupee} />
      </div>
      <p className="text-sm text-muted-foreground">Physical cards assigned: {buyer.totalCardsAssigned} | Cards activated: {buyer.totalCardsActivated}</p>
      <Card><CardHeader><CardTitle>Paid Orders</CardTitle></CardHeader><CardContent>
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Date</TableHead><TableHead>Cards</TableHead><TableHead>Total Paid</TableHead><TableHead>Payment</TableHead><TableHead>Order Status</TableHead><TableHead className="text-right">Recipients</TableHead></TableRow></TableHeader>
          <TableBody>{buyer.orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell><button className="font-mono text-xs font-medium text-primary hover:underline" onClick={() => setOrderId(order.id)}>{order.orderNumber ?? order.id}</button></TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(order.date)}</TableCell>
              <TableCell><button className="font-medium text-primary hover:underline" onClick={() => setOrderId(order.id)}>{order.items.reduce((total, item) => total + item.qty, 0)} cards</button></TableCell>
              <TableCell className="whitespace-nowrap">{formatCurrency(order.total)}</TableCell>
              <TableCell><StatusBadge status={order.paymentStatusLabel ?? order.paymentStatus} /></TableCell>
              <TableCell><StatusBadge status={order.status} /></TableCell>
              <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => setOrderId(order.id)}><Eye /> View Recipients</Button></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></div>
      </CardContent></Card>
      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setOrderId(null) }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-5xl">
          <SheetHeader>
            <SheetTitle>Order {selected?.orderNumber ?? selected?.id}</SheetTitle>
            <SheetDescription>{selected?.items.reduce((total, item) => total + item.qty, 0) ?? 0} purchased cards | {selected ? formatDate(selected.date) : ""}</SheetDescription>
          </SheetHeader>
          {selected && <div className="space-y-4 px-4 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><StatusBadge status={selected.paymentStatusLabel ?? selected.paymentStatus} /><StatusBadge status={selected.status} /></div>
              <Button asChild variant="outline" size="sm"><Link to={`/admin/orders?order=${selected.id}`}>Manage Card Assignments</Link></Button>
            </div>
            <OrderRecipientsTable recipients={selected.recipients ?? []} />
            {!selected.recipients?.length && selected.assignedCardId && <p className="text-sm text-muted-foreground">Historical assigned card: {selected.assignedCardId}</p>}
          </div>}
        </SheetContent>
      </Sheet>
    </div>
  )
}
