import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface ReportEntry {
  id: string
  name: string
  type: "Sales Report" | "Tap Analytics" | "Customer Report" | "Order Report"
  generatedOn: string // ISO datetime
  filename: string
  content: string // raw CSV/text content, kept so it can be re-downloaded later
  mime: string
}

interface ReportsState {
  reports: ReportEntry[]
  addReport: (r: Omit<ReportEntry, "id">) => ReportEntry
}

function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

const SEED_REPORTS: ReportEntry[] = [
  {
    id: "RPT001",
    name: "Sales Report - Monthly",
    type: "Sales Report",
    generatedOn: isoDaysAgo(28),
    filename: "sales-report-monthly.csv",
    content: "Report,Generated\nSales Report,Previously generated",
    mime: "text/csv;charset=utf-8;",
  },
  {
    id: "RPT002",
    name: "Tap Analytics - Last 30 days",
    type: "Tap Analytics",
    generatedOn: isoDaysAgo(14),
    filename: "tap-analytics-last-30-days.csv",
    content: "Report,Generated\nTap Analytics,Previously generated",
    mime: "text/csv;charset=utf-8;",
  },
  {
    id: "RPT003",
    name: "Customer Report - All Customers",
    type: "Customer Report",
    generatedOn: isoDaysAgo(7),
    filename: "customer-report-all.csv",
    content: "Report,Generated\nCustomer Report,Previously generated",
    mime: "text/csv;charset=utf-8;",
  },
  {
    id: "RPT004",
    name: "Order Report - Q Overview",
    type: "Order Report",
    generatedOn: isoDaysAgo(2),
    filename: "order-report-overview.csv",
    content: "Report,Generated\nOrder Report,Previously generated",
    mime: "text/csv;charset=utf-8;",
  },
]

export const useReportsStore = create<ReportsState>()(
  persist(
    (set, get) => ({
      reports: SEED_REPORTS,
      addReport: (r) => {
        const id = `RPT${String(get().reports.length + 1).padStart(3, "0")}`
        const entry: ReportEntry = { ...r, id }
        set((s) => ({ reports: [entry, ...s.reports] }))
        return entry
      },
    }),
    { name: "taplink-admin-reports" },
  ),
)
