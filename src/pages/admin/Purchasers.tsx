import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Eye, Search, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TablePagination } from "@/components/admin/TablePagination"
import { adminPurchaserApi } from "@/lib/purchasers-api"
import { formatCurrency, formatDate } from "@/lib/mock-api"

export default function AdminPurchasers() {
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["admin-purchasers", page, search],
    queryFn: () => adminPurchaserApi.list({ page, search }),
    placeholderData: keepPreviousData,
  })
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Purchasers</h1>
        <p className="text-sm text-muted-foreground">{data?.count ?? 0} purchases with successful payments</p>
      </div>
      <Card><CardContent className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search purchasers" placeholder="Search by order, name, email or phone..." className="pl-9" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        </div>
        {isLoading ? <div className="space-y-2">{[1, 2, 3, 4].map((row) => <Skeleton key={row} className="h-12 w-full" />)}</div> : isError ? (
          <div className="space-y-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unable to load purchasers."}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow>
            <TableHead>Order ID</TableHead><TableHead>Purchaser Name</TableHead><TableHead>Purchaser Email</TableHead><TableHead>Purchaser Phone</TableHead>
            <TableHead>Cards Purchased</TableHead><TableHead>Total Paid</TableHead><TableHead>Purchase Date</TableHead><TableHead className="text-right">View Details</TableHead>
          </TableRow></TableHeader>
          <TableBody className={isFetching ? "opacity-60" : undefined}>
            {(data?.data ?? []).map((buyer) => <TableRow key={buyer.id}>
              <TableCell><Link className="font-mono text-xs font-medium text-primary hover:underline" to={`/admin/purchasers/${buyer.id}`}>{buyer.orderNumber ?? buyer.id}</Link></TableCell>
              <TableCell><Link className="font-medium text-primary hover:underline" to={`/admin/purchasers/${buyer.id}`}>{buyer.name || "Not recorded"}</Link></TableCell>
              <TableCell className="text-muted-foreground">{buyer.email || "Not recorded"}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{buyer.phone || "Not recorded"}</TableCell>
              <TableCell><Link className="font-medium text-primary hover:underline" to={`/admin/purchasers/${buyer.id}`}>{buyer.totalCardsPurchased} cards</Link></TableCell>
              <TableCell className="whitespace-nowrap">{formatCurrency(buyer.totalAmountPaid)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(buyer.purchaseDate)}</TableCell>
              <TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link to={`/admin/purchasers/${buyer.id}`}><Eye /> View Details</Link></Button></TableCell>
            </TableRow>)}
            {data?.data.length === 0 && <TableRow><TableCell colSpan={8} className="py-14 text-center">
              <ShoppingBag className="mx-auto mb-2 size-8 text-muted-foreground" />
              <p className="font-medium">No purchasers found</p><p className="mt-1 text-sm text-muted-foreground">Successfully paid purchases will appear here.</p>
            </TableCell></TableRow>}
          </TableBody>
        </Table></div>}
        <TablePagination page={page} totalPages={Math.max(1, data?.numPages ?? 1)} onPageChange={setPage} totalItems={data?.count ?? 0} pageSize={10} />
      </CardContent></Card>
    </div>
  )
}
