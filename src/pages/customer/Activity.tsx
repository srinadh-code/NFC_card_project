import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Eye, MousePointerClick, QrCode } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { ErrorState } from "@/components/customer/ErrorState"
import { useCustomerAuthStore } from "@/store/auth-store"
import { analyticsApi, type ApiAnalyticsEvent } from "@/lib/api"
import { formatDateTime } from "@/lib/mock-api"

type Feed = "views" | "taps" | "scans"

const FEED_META: Record<Feed, { label: string; icon: typeof Eye; fetcher: (page: number) => ReturnType<typeof analyticsApi.getViews>; empty: string }> = {
  views: { label: "Profile Views", icon: Eye, fetcher: (p) => analyticsApi.getViews(p, 10), empty: "No profile views recorded yet." },
  taps: { label: "NFC Taps", icon: MousePointerClick, fetcher: (p) => analyticsApi.getTaps(p, 10), empty: "No NFC taps recorded yet." },
  scans: { label: "QR Scans", icon: QrCode, fetcher: (p) => analyticsApi.getScans(p, 10), empty: "No QR scans recorded yet." },
}

function EventTable({ feed }: { feed: Feed }) {
  const [page, setPage] = useState(1)
  const meta = FEED_META[feed]

  const query = useQuery({
    queryKey: ["customer-activity", feed, page],
    queryFn: () => meta.fetcher(page),
  })

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }

  const events = query.data?.items ?? []
  const pagination = query.data?.pagination

  if (events.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{meta.empty}</p>
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date &amp; Time</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event: ApiAnalyticsEvent) => (
            <TableRow key={event.id}>
              <TableCell className="whitespace-nowrap">{formatDateTime(event.created_at)}</TableCell>
              <TableCell>{event.device || "Unknown"}</TableCell>
              <TableCell>
                <Badge variant="soft">{event.source || "Direct"}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{event.metadata || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pagination && pagination.num_pages > 1 && (
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
            {Array.from({ length: pagination.num_pages }).map((_, i) => (
              <PaginationItem key={i}>
                <PaginationLink
                  href="#"
                  isActive={pagination.page === i + 1}
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
                  setPage((p) => Math.min(pagination.num_pages, p + 1))
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </>
  )
}

export default function CustomerActivity() {
  const customer = useCustomerAuthStore((s) => s.customer)

  if (!customer) return null

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">Real, timestamped events recorded on your card and profile.</p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="taps">
            <TabsList>
              {(Object.keys(FEED_META) as Feed[]).map((feed) => {
                const Icon = FEED_META[feed].icon
                return (
                  <TabsTrigger key={feed} value={feed} className="gap-1.5">
                    <Icon className="size-3.5" />
                    {FEED_META[feed].label}
                  </TabsTrigger>
                )
              })}
            </TabsList>
            {(Object.keys(FEED_META) as Feed[]).map((feed) => (
              <TabsContent key={feed} value={feed} className="pt-4">
                <EventTable feed={feed} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
