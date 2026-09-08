import { useMemo, useState } from "react"
import { toast } from "sonner"
import { TrendingUp, Radio, Users, ShoppingCart, Download } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toCsv, downloadTextFile } from "@/components/admin/export-csv"
import { useReportsStore, type ReportEntry } from "@/store/reports-store"
import { adminReportApi } from "@/lib/api"
import { formatDateTime } from "@/lib/mock-api"

const REPORT_TYPES: { type: ReportEntry["type"]; description: string; icon: typeof TrendingUp }[] = [
  { type: "Sales Report", description: "All orders with totals and payment status.", icon: TrendingUp },
  { type: "Tap Analytics", description: "Tap, QR scan and visitor totals by customer.", icon: Radio },
  { type: "Customer Report", description: "Full customer roster with lifetime value.", icon: Users },
  { type: "Order Report", description: "Every order with status and fulfilment info.", icon: ShoppingCart },
]

export default function AdminReports() {
  const reports = useReportsStore((s) => s.reports)
  const addReport = useReportsStore((s) => s.addReport)
  const [generating, setGenerating] = useState<ReportEntry["type"] | null>(null)

  const sorted = useMemo(
    () => [...reports].sort((a, b) => new Date(b.generatedOn).getTime() - new Date(a.generatedOn).getTime()),
    [reports],
  )

  async function buildContent(type: ReportEntry["type"]): Promise<{ content: string; filename: string }> {
    const dateStamp = new Date().toISOString().slice(0, 10)
    switch (type) {
      case "Sales Report": {
        const rows = await adminReportApi.sales()
        return {
          content: toCsv(
            rows.map((r) => ({
              OrderID: r.orderId,
              Customer: r.customer,
              Amount: r.amount,
              Shipping: r.shipping,
              Total: r.total,
              PaymentStatus: r.paymentStatus,
              OrderStatus: r.orderStatus,
              Date: r.date,
            })),
          ),
          filename: `sales-report-${dateStamp}.csv`,
        }
      }
      case "Tap Analytics": {
        const rows = await adminReportApi.tapAnalytics()
        return {
          content: toCsv(
            rows.map((r) => ({
              CustomerID: r.customerId,
              CustomerName: r.customerName,
              Taps: r.taps,
              QrScans: r.qrScans,
              ProfileViews: r.profileViews,
            })),
          ),
          filename: `tap-analytics-${dateStamp}.csv`,
        }
      }
      case "Customer Report": {
        const rows = await adminReportApi.customers()
        return {
          content: toCsv(
            rows.map((c) => ({
              ID: c.id,
              Name: c.name,
              Email: c.email,
              Phone: c.phone,
              Status: c.status,
              TotalOrders: c.totalOrders,
              TotalSpent: c.totalSpent,
              TotalTaps: c.totalTaps,
              JoinedOn: c.joinedOn,
            })),
          ),
          filename: `customer-report-${dateStamp}.csv`,
        }
      }
      case "Order Report": {
        const rows = await adminReportApi.orders()
        return {
          content: toCsv(
            rows.map((o) => ({
              OrderID: o.orderId,
              Customer: o.customer,
              Items: o.items,
              Total: o.total,
              Status: o.status,
              PaymentMethod: o.paymentMethod,
              Date: o.date,
            })),
          ),
          filename: `order-report-${dateStamp}.csv`,
        }
      }
    }
  }

  async function handleGenerate(type: ReportEntry["type"]) {
    setGenerating(type)
    try {
      const { content, filename } = await buildContent(type)
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
    } catch {
      toast.error("Couldn't generate that report. Please try again.")
    } finally {
      setGenerating(null)
    }
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
              <Button className="w-full" onClick={() => handleGenerate(type)} disabled={generating !== null}>
                <Download /> {generating === type ? "Generating…" : "Generate"}
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
