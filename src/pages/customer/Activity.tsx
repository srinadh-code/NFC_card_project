import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { BookmarkCheck, Eye, MousePointerClick, QrCode } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { useCustomerAuthStore } from "@/store/auth-store"
import { activityRecords } from "@/data/seed"
import { simulateLatency, formatDateTime } from "@/lib/mock-api"
import type { ActivityRecord } from "@/types"

const PAGE_SIZE = 10

type ActionFilter = "All" | ActivityRecord["action"]
type TimeRange = "today" | "week" | "month" | "all"

const ACTION_META: Record<
  ActivityRecord["action"],
  { icon: typeof MousePointerClick; variant: "default" | "soft" | "success" | "warning" }
> = {
  "Card Tapped": { icon: MousePointerClick, variant: "default" },
  "QR Code Scanned": { icon: QrCode, variant: "soft" },
  "Profile Viewed": { icon: Eye, variant: "success" },
  "Contact Saved": { icon: BookmarkCheck, variant: "warning" },
}

const TIME_RANGE_LABEL: Record<TimeRange, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All Time",
}

function fetchActivity(customerId: string) {
  return activityRecords
    .filter((r) => r.customerId === customerId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function isSameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function withinTimeRange(dateIso: string, range: TimeRange) {
  if (range === "all") return true
  const now = new Date()
  const date = new Date(dateIso)
  if (range === "today") return isSameCalendarDay(date, now)
  const cutoff = new Date(now)
  if (range === "week") cutoff.setDate(now.getDate() - 7)
  else cutoff.setDate(now.getDate() - 30)
  return date >= cutoff
}

export default function CustomerActivity() {
  const customer = useCustomerAuthStore((s) => s.customer)
  const [actionFilter, setActionFilter] = useState<ActionFilter>("All")
  const [timeRange, setTimeRange] = useState<TimeRange>("all")
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ["customer-activity", customer?.id],
    queryFn: () => simulateLatency(fetchActivity(customer?.id ?? ""), 300),
    enabled: Boolean(customer?.id),
  })

  const filtered = useMemo(() => {
    if (!data) return []
    return data
      .filter((r) => actionFilter === "All" || r.action === actionFilter)
      .filter((r) => withinTimeRange(r.date, timeRange))
  }, [data, actionFilter, timeRange])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRecords = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function handleActionFilterChange(value: ActionFilter) {
    setActionFilter(value)
    setPage(1)
  }

  function handleTimeRangeChange(value: TimeRange) {
    setTimeRange(value)
    setPage(1)
  }

  if (!customer) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground">All recent activities on your card.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={timeRange} onValueChange={(v) => handleTimeRangeChange(v as TimeRange)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TIME_RANGE_LABEL) as TimeRange[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {TIME_RANGE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={(v) => handleActionFilterChange(v as ActionFilter)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Actions</SelectItem>
              <SelectItem value="Card Tapped">Card Tapped</SelectItem>
              <SelectItem value="QR Code Scanned">QR Code Scanned</SelectItem>
              <SelectItem value="Profile Viewed">Profile Viewed</SelectItem>
              <SelectItem value="Contact Saved">Contact Saved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No activity found for this filter.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date &amp; Time</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRecords.map((record) => {
                    const meta = ACTION_META[record.action]
                    const Icon = meta.icon
                    return (
                      <TableRow key={record.id}>
                        <TableCell className="whitespace-nowrap">{formatDateTime(record.date)}</TableCell>
                        <TableCell>{record.location}</TableCell>
                        <TableCell>{record.device}</TableCell>
                        <TableCell>
                          <Badge variant={meta.variant} className="gap-1">
                            <Icon className="size-3" />
                            {record.action}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <Pagination className="mt-4 justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          setPage((p) => Math.max(1, p - 1))
                        }}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <PaginationItem key={i}>
                        <PaginationLink
                          href="#"
                          isActive={currentPage === i + 1}
                          onClick={(e) => {
                            e.preventDefault()
                            setPage(i + 1)
                          }}
                        >
                          {i + 1}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          setPage((p) => Math.min(totalPages, p + 1))
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
