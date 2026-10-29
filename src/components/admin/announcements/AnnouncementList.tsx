import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Eye, Pencil, Plus, Radio, RadioTower, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/admin/ConfirmDialog"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { AnnouncementForm } from "@/components/admin/announcements/AnnouncementForm"
import { adminAnnouncementApi, ApiError, type AnnouncementFormPayload, type ApiAnnouncement } from "@/lib/api"
import { formatDate, formatDateTime } from "@/lib/mock-api"

const TYPE_LABELS: Record<string, string> = {
  GENERAL: "General",
  FESTIVAL: "Festival",
  OFFER: "Offer / Promotion",
  PRODUCT: "New Product",
  IMPORTANT: "Important Update",
  MAINTENANCE: "Maintenance",
  FEATURE: "Feature Update",
}

const DISPLAY_LABELS: Record<string, string> = {
  CUSTOMER: "Customer Dashboard",
  PUBLIC: "Public Website",
  BOTH: "Both",
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  expired: "Expired",
  disabled: "Disabled",
}

function discountLabel(a: ApiAnnouncement): string {
  if (a.announcement_type !== "OFFER") return "—"
  if (a.discount_type === "PERCENTAGE" && a.discount_percentage != null) return `${a.discount_percentage}% OFF`
  if (a.discount_type === "FIXED" && a.discount_amount) return `₹${a.discount_amount} OFF`
  return "—"
}

function eligibilityLabel(a: ApiAnnouncement): string {
  if (a.announcement_type !== "OFFER") return "—"
  return a.first_order_only ? "First Order Only" : "All Customers"
}

// Kept short (not the full comma list) so this column can't reintroduce
// the table's horizontal-overflow issue — the full list is still one click
// away in the View dialog below.
function applicableProductsLabel(a: ApiAnnouncement): string {
  if (a.announcement_type !== "OFFER") return "—"
  if (a.applies_to_all_products) return "All Products"
  const types = a.applicable_card_types.split(",").map((s) => s.trim()).filter(Boolean)
  if (types.length === 0) return "—"
  if (types.length === 1) return types[0]
  return `${types[0]} +${types.length - 1} more`
}

function friendlyError(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  )
}

export function AnnouncementList() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ApiAnnouncement | null>(null)
  const [viewing, setViewing] = useState<ApiAnnouncement | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const query = useQuery({
    queryKey: ["admin-announcements", page],
    queryFn: () => adminAnnouncementApi.list({ page }),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin-announcements"] })
  }

  const createMutation = useMutation({
    mutationFn: (payload: AnnouncementFormPayload) => adminAnnouncementApi.create(payload),
    onSuccess: (created) => {
      invalidate()
      setCreateOpen(false)
      toast.success(created.is_published ? "Announcement published." : "Announcement saved as draft.")
    },
    onError: (err) => toast.error(friendlyError(err, "Couldn't save that announcement.")),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: AnnouncementFormPayload }) =>
      adminAnnouncementApi.update(id, payload),
    onSuccess: () => {
      invalidate()
      setEditing(null)
      toast.success("Announcement updated.")
    },
    onError: (err) => toast.error(friendlyError(err, "Couldn't update that announcement.")),
  })

  const publishMutation = useMutation({
    mutationFn: (id: number) => adminAnnouncementApi.publish(id),
    onSuccess: () => {
      invalidate()
      toast.success("Announcement published.")
    },
    onError: (err) => toast.error(friendlyError(err, "Couldn't publish that announcement.")),
  })

  const unpublishMutation = useMutation({
    mutationFn: (id: number) => adminAnnouncementApi.unpublish(id),
    onSuccess: () => {
      invalidate()
      toast.success("Announcement unpublished.")
    },
    onError: (err) => toast.error(friendlyError(err, "Couldn't unpublish that announcement.")),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminAnnouncementApi.remove(id),
    onSuccess: () => {
      invalidate()
      setDeletingId(null)
      toast.success("Announcement deleted.")
    },
    onError: (err) => toast.error(friendlyError(err, "Couldn't delete that announcement.")),
  })

  const items = query.data?.items ?? []
  const pagination = query.data?.pagination

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-tight">Announcements</h3>
            <p className="text-sm text-muted-foreground">
              Broadcast to the Customer Dashboard notification bell, the public website, or both.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New Announcement
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Display Location</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Applicable Products</TableHead>
                <TableHead>Eligibility</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={11}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                    No announcements yet. Create one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="max-w-[220px] truncate font-medium">{a.title}</TableCell>
                    <TableCell className="text-muted-foreground">{TYPE_LABELS[a.announcement_type]}</TableCell>
                    <TableCell className="text-muted-foreground">{DISPLAY_LABELS[a.display_location]}</TableCell>
                    <TableCell className="text-muted-foreground">{discountLabel(a)}</TableCell>
                    <TableCell className="text-muted-foreground">{applicableProductsLabel(a)}</TableCell>
                    <TableCell className="text-muted-foreground">{eligibilityLabel(a)}</TableCell>
                    <TableCell>
                      <StatusBadge status={STATUS_LABELS[a.status]} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.start_at ? formatDate(a.start_at) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.end_at ? formatDate(a.end_at) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(a.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label="View" onClick={() => setViewing(a)}>
                          <Eye className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(a)}>
                          <Pencil className="size-4" />
                        </Button>
                        {a.is_published ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Disable"
                            title="Disable"
                            onClick={() => unpublishMutation.mutate(a.id)}
                            disabled={unpublishMutation.isPending}
                          >
                            <Radio className="size-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Publish"
                            title="Publish"
                            onClick={() => publishMutation.mutate(a.id)}
                            disabled={publishMutation.isPending}
                          >
                            <RadioTower className="size-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeletingId(a.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {pagination && pagination.num_pages > 1 && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <p className="text-xs text-muted-foreground">
              Page {pagination.page} of {pagination.num_pages}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.num_pages}
              onClick={() => setPage((p) => Math.min(pagination.num_pages, p + 1))}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Announcement</DialogTitle>
            <DialogDescription>
              Save as a draft to keep working on it, or publish now (or on a schedule).
            </DialogDescription>
          </DialogHeader>
          <AnnouncementForm
            onSubmit={(payload) => createMutation.mutateAsync(payload).then(() => {})}
            onCancel={() => setCreateOpen(false)}
            submitting={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Announcement</DialogTitle>
            <DialogDescription>
              Publishing/unpublishing is a separate action — use the row's own button for that.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <AnnouncementForm
              initial={editing}
              onSubmit={(payload) => updateMutation.mutateAsync({ id: editing.id, payload }).then(() => {})}
              onCancel={() => setEditing(null)}
              submitting={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* View */}
      <Dialog open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.title}</DialogTitle>
            <DialogDescription>{viewing && STATUS_LABELS[viewing.status]}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailRow label="Message" value={viewing.message} />
              <DetailRow label="Type" value={TYPE_LABELS[viewing.announcement_type]} />
              <DetailRow label="Display Location" value={DISPLAY_LABELS[viewing.display_location]} />
              <DetailRow label="Recipients Notified" value={String(viewing.recipient_count)} />
              <DetailRow label="Start" value={viewing.start_at ? formatDateTime(viewing.start_at) : "Immediately"} />
              <DetailRow label="End" value={viewing.end_at ? formatDateTime(viewing.end_at) : "No end date"} />
              {viewing.announcement_type === "OFFER" && (
                <>
                  <DetailRow label="Offer Title" value={viewing.offer_title} />
                  <DetailRow label="Promo Code" value={viewing.promo_code} />
                  <DetailRow label="Discount" value={discountLabel(viewing)} />
                  <DetailRow label="Automatic Apply" value={viewing.automatic_apply ? "On" : "Off (code required)"} />
                  <DetailRow
                    label="Customer Eligibility"
                    value={viewing.first_order_only ? "First Order Only" : "All Customers"}
                  />
                  <DetailRow
                    label="Applicable Products"
                    value={viewing.applies_to_all_products ? "All Products" : viewing.applicable_card_types}
                  />
                  <DetailRow label="CTA" value={viewing.cta_text ? `${viewing.cta_text} → ${viewing.cta_link}` : ""} />
                </>
              )}
              <DetailRow label="Created By" value={viewing.created_by_name ?? "—"} />
              <DetailRow label="Created" value={formatDateTime(viewing.created_at)} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Delete this announcement?"
        description="This removes it from the admin list and the public website immediately. Customers who already received it in their notification bell keep their copy, just without the offer details."
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete"}
        onConfirm={() => deletingId !== null && deleteMutation.mutate(deletingId)}
      />
    </Card>
  )
}
