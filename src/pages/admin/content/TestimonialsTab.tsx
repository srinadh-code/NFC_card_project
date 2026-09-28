import { useEffect, useState, type ReactNode } from "react"
import {
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  MessageSquareQuote,
  MoreHorizontal,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StarRating } from "@/components/ui/star-rating"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatCard } from "@/components/admin/StatCard"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { TablePagination } from "@/components/admin/TablePagination"
import { ConfirmDialog } from "@/components/admin/ConfirmDialog"
import { TestimonialAvatar } from "@/components/marketing/TestimonialAvatar"
import {
  errorMessage,
  useAdminDeleteTestimonial,
  useAdminTestimonialStats,
  useAdminTestimonials,
  useModerateTestimonial,
} from "@/hooks/useTestimonials"
import { formatDate } from "@/lib/mock-api"
import {
  TESTIMONIAL_STATUS_LABELS,
  type AdminTestimonial,
  type AdminTestimonialAction,
  type TestimonialStatus,
} from "@/types/testimonial"

const PAGE_SIZE = 10
type StatusFilter = TestimonialStatus | "ALL"

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export default function TestimonialsTab() {
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
  const [page, setPage] = useState(1)
  const [viewingId, setViewingId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<AdminTestimonial | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const listQuery = useAdminTestimonials({ page, search: search || undefined, status: statusFilter })
  const statsQuery = useAdminTestimonialStats()
  const moderate = useModerateTestimonial()
  const deleteMutation = useAdminDeleteTestimonial()

  const rows = listQuery.data?.data ?? []
  const totalItems = listQuery.data?.count ?? 0
  const totalPages = Math.max(1, listQuery.data?.numPages ?? 1)
  // Look the open row up in fresh list data so the dialog reflects actions taken from it.
  const viewing = rows.find((r) => r.id === viewingId) ?? null
  const stats = statsQuery.data

  const act = (id: number, action: AdminTestimonialAction) => moderate.mutate({ id, action })

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Testimonials" value={stats?.total ?? "—"} icon={MessageSquareQuote} />
        <StatCard label="Pending" value={stats?.pending ?? "—"} icon={Clock} />
        <StatCard label="Approved" value={stats?.approved ?? "—"} icon={CheckCircle2} />
        <StatCard label="Rejected" value={stats?.rejected ?? "—"} icon={XCircle} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by customer name, email or company..."
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as StatusFilter)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {listQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : listQuery.isError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {errorMessage(listQuery.error, "Unable to load testimonials. Please try again.")}
              </p>
              <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Visibility</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={listQuery.isFetching ? "opacity-60" : undefined}>
                  {rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <TestimonialAvatar src={t.profile_image} name={t.name} className="size-9" />
                          <div className="min-w-0">
                            <p className="font-medium">{t.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{t.customer_email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StarRating value={t.rating} readOnly size="sm" />
                      </TableCell>
                      <TableCell className="max-w-xs text-muted-foreground">{truncate(t.review, 70)}</TableCell>
                      <TableCell>
                        <StatusBadge status={TESTIMONIAL_STATUS_LABELS[t.status]} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.is_active ? "Active" : "Hidden"} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(t.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          testimonial={t}
                          disabled={moderate.isPending}
                          onView={() => setViewingId(t.id)}
                          onAction={(action) => act(t.id, action)}
                          onDelete={() => setDeleting(t)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        {search || statusFilter !== "ALL"
                          ? "No testimonials match your filters."
                          : "No testimonials yet. They'll appear here as customers submit them."}
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
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
          />
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Testimonial Details</DialogTitle>
            <DialogDescription className="sr-only">Full detail for this customer testimonial.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {viewing.profile_image ? (
                  <a href={viewing.profile_image} target="_blank" rel="noreferrer" title="Open full-size image">
                    <TestimonialAvatar src={viewing.profile_image} name={viewing.name} className="size-20" />
                  </a>
                ) : (
                  <TestimonialAvatar name={viewing.name} className="size-20" />
                )}
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{viewing.name}</p>
                  {(viewing.designation || viewing.company) && (
                    <p className="text-sm text-muted-foreground">
                      {[viewing.designation, viewing.company].filter(Boolean).join(" @ ")}
                    </p>
                  )}
                </div>
              </div>
              <StarRating value={viewing.rating} readOnly />
              <p className="text-sm leading-relaxed whitespace-pre-line">&ldquo;{viewing.review}&rdquo;</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Detail label="Customer Account">
                  {viewing.customer_name || "—"}
                  <span className="block truncate text-muted-foreground">{viewing.customer_email}</span>
                </Detail>
                <Detail label="Order">{viewing.order_number ?? "—"}</Detail>
                <Detail label="Submitted">{formatDate(viewing.created_at)}</Detail>
                <Detail label="Last Updated">{formatDate(viewing.updated_at)}</Detail>
                <Detail label="Status">
                  <StatusBadge status={TESTIMONIAL_STATUS_LABELS[viewing.status]} />
                </Detail>
                <Detail label="Visibility">
                  <StatusBadge status={viewing.is_active ? "Active" : "Hidden"} />
                </Detail>
              </div>
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {viewing.status !== "APPROVED" && (
                  <Button disabled={moderate.isPending} onClick={() => act(viewing.id, "approve")}>
                    <CheckCircle2 className="size-4" /> Approve
                  </Button>
                )}
                {viewing.status !== "REJECTED" && (
                  <Button
                    variant="destructive"
                    disabled={moderate.isPending}
                    onClick={() => act(viewing.id, "reject")}
                  >
                    <XCircle className="size-4" /> Reject
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={moderate.isPending}
                  onClick={() => act(viewing.id, "toggle-active")}
                >
                  {viewing.is_active ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {viewing.is_active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this testimonial?"
        description="This permanently removes the testimonial and its photo. The customer will no longer see it either."
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id, { onSettled: () => setDeleting(null) })
        }}
      />
    </div>
  )
}

function RowActions({
  testimonial: t,
  disabled,
  onView,
  onAction,
  onDelete,
}: {
  testimonial: AdminTestimonial
  disabled: boolean
  onView: () => void
  onAction: (action: AdminTestimonialAction) => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${t.name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onView}>
          <Eye /> View
        </DropdownMenuItem>
        {t.status !== "APPROVED" && (
          <DropdownMenuItem disabled={disabled} onClick={() => onAction("approve")}>
            <CheckCircle2 /> Approve
          </DropdownMenuItem>
        )}
        {t.status !== "REJECTED" && (
          <DropdownMenuItem disabled={disabled} onClick={() => onAction("reject")}>
            <XCircle /> Reject
          </DropdownMenuItem>
        )}
        {t.status !== "PENDING" && (
          <DropdownMenuItem disabled={disabled} onClick={() => onAction("pending")}>
            <RotateCcw /> Move to Pending
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={disabled} onClick={() => onAction("toggle-active")}>
          {t.is_active ? <EyeOff /> : <Eye />} {t.is_active ? "Deactivate" : "Activate"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">{label}</p>
      <div>{children}</div>
    </div>
  )
}
