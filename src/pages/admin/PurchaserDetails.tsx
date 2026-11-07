import { Link, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, CreditCard, Eye, IndianRupee, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OrderRecipientsTable } from "@/components/admin/OrderRecipientsTable"
import { StatCard } from "@/components/admin/StatCard"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { ApiError } from "@/lib/api"
import { adminPurchaserApi } from "@/lib/purchasers-api"
import { formatCurrency, formatDate } from "@/lib/mock-api"

export default function AdminPurchaserDetails() {
  const { id } = useParams<{ id: string }>()
  const { data: buyer, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-purchaser", id], queryFn: () => adminPurchaserApi.get(id ?? ""), enabled: !!id, retry: false,
  })
  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-32 w-full" /><Skeleton className="h-80 w-full" /></div>
  if (isError || !buyer) return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-xl font-semibold">{error instanceof ApiError && error.status === 404 ? "Paid purchase not found" : "Unable to load purchase"}</h1>
      <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Please try again."}</p>
      <Button variant="outline" onClick={() => refetch()}>Retry</Button>
      <Link className="text-sm text-primary hover:underline" to="/admin/purchasers">Back to Purchasers</Link>
    </div>
  )
  const order = buyer.order
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link className="hover:underline" to="/admin/purchasers">Purchasers</Link><ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">{buyer.orderNumber ?? buyer.id}</span>
      </div>
      <Card><CardContent className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{buyer.name || "Name not recorded"}</h1>
        <p className="break-all text-sm text-muted-foreground">{buyer.email || "Email not recorded"}</p>
        <p className="text-sm text-muted-foreground">{buyer.phone || "Phone not recorded"}</p>
      </CardContent></Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Order ID" value={buyer.orderNumber ?? buyer.id} icon={ShoppingBag} />
        <StatCard label="Cards Purchased" value={buyer.totalCardsPurchased} icon={CreditCard} />
        <StatCard label="Total Paid" value={formatCurrency(buyer.totalAmountPaid)} icon={IndianRupee} />
      </div>
      <p className="text-sm text-muted-foreground">Physical cards assigned: {buyer.totalCardsAssigned} | Cards activated: {buyer.totalCardsActivated}</p>
      <Card><CardHeader><CardTitle>Paid Order</CardTitle></CardHeader><CardContent>
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Date</TableHead><TableHead>Cards</TableHead><TableHead>Total Paid</TableHead><TableHead>Payment</TableHead><TableHead>Order Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow key={order.id}>
              <TableCell className="font-mono text-xs font-medium">{order.orderNumber ?? order.id}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(order.date)}</TableCell>
              <TableCell>{buyer.totalCardsPurchased} cards</TableCell>
              <TableCell className="whitespace-nowrap">{formatCurrency(order.total)}</TableCell>
              <TableCell><StatusBadge status={order.paymentStatusLabel ?? order.paymentStatus} /><span className="ml-2 text-xs text-muted-foreground">{order.paymentMethod}</span></TableCell>
              <TableCell><StatusBadge status={order.status} /></TableCell>
              <TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link to={`/admin/orders?order=${order.id}`}><Eye /> Manage Card Assignments</Link></Button></TableCell>
            </TableRow>
          </TableBody>
        </Table></div>
        <div className="mt-4"><OrderRecipientsTable recipients={order.recipients ?? []} /></div>
        {!order.recipients?.length && order.assignedCardId && <p className="text-sm text-muted-foreground">Historical assigned card: {order.assignedCardId}</p>}
      </CardContent></Card>
    </div>
  )
}
