import { useMemo } from "react"
import { toast } from "sonner"
import { TrendingUp, Radio, Users, ShoppingCart, Download } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toCsv, downloadTextFile } from "@/components/admin/export-csv"
import { useDataStore } from "@/store/data-store"
import { useReportsStore, type ReportEntry } from "@/store/reports-store"
import { formatDateTime } from "@/lib/mock-api"
import { analyticsRecords } from "@/data/seed"

const REPORT_TYPES: { type: ReportEntry["type"]; description: string; icon: typeof TrendingUp }[] = [
  { type: "Sales Report", description: "All orders with totals and payment status.", icon: TrendingUp },
  { type: "Tap Analytics", description: "Tap, QR scan and visitor totals by customer.", icon: Radio },
  { type: "Customer Report", description: "Full customer roster with lifetime value.", icon: Users },
  { type: "Order Report", description: "Every order with status and fulfilment info.", icon: ShoppingCart },
]

export default function AdminReports() {
  const customers = useDataStore((s) => s.customers)
  const orders = useDataStore((s) => s.orders)
  const reports = useReportsStore((s) => s.reports)
  const addReport = useReportsStore((s) => s.addReport)

  const sorted = useMemo(
    () => [...reports].sort((a, b) => new Date(b.generatedOn).getTime() - new Date(a.generatedOn).getTime()),
    [reports],
  )

  function buildContent(type: ReportEntry["type"]): { content: string; filename: string } {
    const dateStamp = new Date().toISOString().slice(0, 10)
    switch (type) {
      case "Sales Report": {
        const rows = orders.map((o) => ({
          OrderID: o.id,
          Customer: o.customerName,
          Amount: o.amount,
          Shipping: o.shipping,
          Total: o.total,
          PaymentStatus: o.paymentStatus,
          OrderStatus: o.status,
          Date: o.date,
        }))
        return { content: toCsv(rows), filename: `sales-report-${dateStamp}.csv` }
      }
      case "Tap Analytics": {
        const byCustomer = new Map<string, { taps: number; qrScans: number; profileViews: number }>()
        for (const r of analyticsRecords) {
          const agg = byCustomer.get(r.customerId) ?? { taps: 0, qrScans: 0, profileViews: 0 }
          agg.taps += r.taps
          agg.qrScans += r.qrScans
          agg.profileViews += r.profileViews
          byCustomer.set(r.customerId, agg)
        }
        const rows = Array.from(byCustomer.entries()).map(([customerId, agg]) => ({
          CustomerID: customerId,
          Taps: agg.taps,
          QrScans: agg.qrScans,
          ProfileViews: agg.profileViews,
        }))
        return { content: toCsv(rows), filename: `tap-analytics-${dateStamp}.csv` }
      }
      case "Customer Report": {
        const rows = customers.map((c) => ({
          ID: c.id,
          Name: c.name,
          Email: c.email,
          Phone: c.phone,
          Status: c.status,
          TotalOrders: c.totalOrders,
          TotalSpent: c.totalSpent,
          TotalTaps: c.totalTaps,
          JoinedOn: c.joinedOn,
        }))
        return { content: toCsv(rows), filename: `customer-report-${dateStamp}.csv` }
      }
      case "Order Report": {
        const rows = orders.map((o) => ({
          OrderID: o.id,
          Customer: o.customerName,
          Items: o.items.length,
          Total: o.total,
          Status: o.status,
          PaymentMethod: o.paymentMethod,
          Date: o.date,
        }))
        return { content: toCsv(rows), filename: `order-report-${dateStamp}.csv` }
      }
    }
  }

  function handleGenerate(type: ReportEntry["type"]) {
    const { content, filename } = buildContent(type)
    downloadTextFile(filename, content, "text/csv;charset=utf-8;")
    addReport({
      name: `${type} - ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
      type,
      generatedOn: new Date().toISOString(),
      filename,
      content,
      mime: "text/csv;charset=utf-8;",
    })
    toast.success(`${type} generated and downloaded.`)
  }

  function handleRedownload(report: ReportEntry) {
    downloadTextFile(report.filename, report.content, report.mime)
    toast.success(`${report.filename} downloaded.`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Generate and download platform reports</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {REPORT_TYPES.map(({ type, description, icon: Icon }) => (
          <Card key={type} className="flex flex-col">
            <CardHeader>
              <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <CardTitle className="text-base">{type}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button className="w-full" onClick={() => handleGenerate(type)}>
                <Download /> Generate
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Generated On</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.type}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(r.generatedOn)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleRedownload(r)}>
                      <Download /> Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    No reports generated yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
