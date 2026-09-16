import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { toast } from "sonner"
import { Search, Eye, MoreHorizontal, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { TablePagination } from "@/components/admin/TablePagination"
import { ConfirmDialog } from "@/components/admin/ConfirmDialog"
import { StarRating } from "@/components/ui/star-rating"
import { adminReviewApi, ApiError, type ApiAdminReview } from "@/lib/api"
import { formatDate } from "@/lib/mock-api"

const PAGE_SIZE = 10

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

export default function AdminReviews() {
  const queryClient = useQueryClient()

  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"All" | "Enabled" | "Disabled">("All")
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState<ApiAdminReview | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ review: ApiAdminReview; nextPublished: boolean } | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["admin-reviews", page, search, statusFilter],
    queryFn: () => adminReviewApi.list({ page, search: search || undefined, status: statusFilter }),
    placeholderData: keepPreviousData,
  })

  const reviews = data?.data ?? []
  const totalItems = data?.count ?? 0
  const totalPages = Math.max(1, data?.numPages ?? 1)

  const statusMutation = useMutation({
    mutationFn: ({ id, is_published }: { id: number; is_published: boolean }) =>
      adminReviewApi.setPublished(id, is_published),
    onSuccess: (updated) => {
      toast.success(updated.is_published ? "Review enabled." : "Review disabled.")
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] })
      setViewing((v) => (v && v.id === updated.id ? updated : v))
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Unable to update this review. Please try again.")
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <p className="text-sm text-muted-foreground">
          Manage customer feedback displayed on the public website. {totalItems} review{totalItems === 1 ? "" : "s"}.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search reviews..."
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as typeof statusFilter)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All</SelectItem>
                <SelectItem value="Enabled">Enabled</SelectItem>
                <SelectItem value="Disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {error instanceof ApiError ? error.message : "Unable to load reviews. Please try again."}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
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
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={isFetching ? "opacity-60" : undefined}>
                  {reviews.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.customer_name}</TableCell>
                      <TableCell>
                        <StarRating value={r.rating} readOnly size="sm" />
                      </TableCell>
                      <TableCell className="max-w-xs text-muted-foreground">{truncate(r.review_text, 60)}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.is_published ? "Enabled" : "Disabled"} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewing(r)}>
                              <Eye /> View
                            </DropdownMenuItem>
                            {r.is_published ? (
                              <DropdownMenuItem onClick={() => setConfirmTarget({ review: r, nextPublished: false })}>
                                <XCircle /> Disable
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => setConfirmTarget({ review: r, nextPublished: true })}>
                                <CheckCircle2 /> Enable
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {reviews.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No reviews found.
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

      {/* Review details */}
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Details</DialogTitle>
            <DialogDescription className="sr-only">Full detail for this customer review.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <p className="text-lg font-semibold">{viewing.customer_name}</p>
              <p className="text-sm text-muted-foreground">{viewing.customer_email}</p>
              <StarRating value={viewing.rating} readOnly />
              <p className="text-sm leading-relaxed">&ldquo;{viewing.review_text}&rdquo;</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Submitted</p>
                  <p>{formatDate(viewing.created_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Updated</p>
                  <p>{formatDate(viewing.updated_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <StatusBadge status={viewing.is_published ? "Enabled" : "Disabled"} />
                </div>
              </div>
              <Button
                variant={viewing.is_published ? "destructive" : "default"}
                onClick={() =>
                  setConfirmTarget({ review: viewing, nextPublished: !viewing.is_published })
                }
              >
                {viewing.is_published ? "Disable Review" : "Enable Review"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title={confirmTarget?.nextPublished ? "Enable this review?" : "Disable this review?"}
        description={
          confirmTarget?.nextPublished
            ? "This review will appear on the public website."
            : "This review will no longer appear on the public website."
        }
        confirmLabel={confirmTarget?.nextPublished ? "Enable Review" : "Disable Review"}
        destructive={!confirmTarget?.nextPublished}
        onConfirm={() => {
          if (confirmTarget) {
            statusMutation.mutate({ id: confirmTarget.review.id, is_published: confirmTarget.nextPublished })
          }
        }}
      />
    </div>
  )
}
