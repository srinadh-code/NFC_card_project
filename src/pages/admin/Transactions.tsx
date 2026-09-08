import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, IndianRupee, RotateCcw, CheckCircle2, XCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { StatCard } from "@/components/admin/StatCard"
import { TablePagination } from "@/components/admin/TablePagination"
import { adminTransactionApi } from "@/lib/api"
import { formatCurrency, formatDate } from "@/lib/mock-api"
import type { PaymentMethod, PaymentStatus } from "@/types"

const PAGE_SIZE = 10
const METHODS: (PaymentMethod | "All")[] = ["All", "UPI", "Card", "Net Banking", "Razorpay", "COD"]
const STATUSES: (PaymentStatus | "All")[] = ["All", "Paid", "Refunded", "Failed", "Pending"]

export default function AdminTransactions() {
  const [search, setSearch] = useState("")
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | "All">("All")
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "All">("All")
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ["admin-transactions", search, methodFilter, statusFilter],
    queryFn: () => adminTransactionApi.list({ search: search || undefined, method: methodFilter, status: statusFilter }),
  })
  const transactions = data?.data ?? []

  const stats = useMemo(() => {
    const totalRevenue = transactions.filter((t) => t.status === "Paid").reduce((s, t) => s + t.amount, 0)
    const totalRefunded = transactions.filter((t) => t.status === "Refunded").reduce((s, t) => s + t.amount, 0)
    const successCount = transactions.filter((t) => t.status === "Paid").length
    const failedCount = transactions.filter((t) => t.status === "Failed").length
    return { totalRevenue, totalRefunded, successCount, failedCount }
  }, [transactions])

  const filtered = transactions

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground">{transactions.length} total transactions</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={IndianRupee} />
        <StatCard label="Total Refunded" value={formatCurrency(stats.totalRefunded)} icon={RotateCcw} />
        <StatCard label="Successful" value={stats.successCount} icon={CheckCircle2} />
        <StatCard label="Failed" value={stats.failedCount} icon={XCircle} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by transaction ID, order ID, or customer..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <Select
              value={methodFilter}
              onValueChange={(v) => {
                setMethodFilter(v as PaymentMethod | "All")
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m === "All" ? "All Methods" : m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as PaymentStatus | "All")
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "All" ? "All Status" : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.id}</TableCell>
                      <TableCell className="text-muted-foreground">{t.orderId}</TableCell>
                      <TableCell>{t.customerName}</TableCell>
                      <TableCell>{formatCurrency(t.amount)}</TableCell>
                      <TableCell>{t.method}</TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(t.date)}</TableCell>
                    </TableRow>
                  ))}
                  {pageItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        No transactions found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <TablePagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
          />
        </CardContent>
      </Card>
    </div>
  )
}
