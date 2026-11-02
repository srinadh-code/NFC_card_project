import { useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Eye, Inbox, Mail, Phone } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ErrorState } from "@/components/customer/ErrorState"
import { ApiError, leadsApi, type ApiLead, type LeadStatus } from "@/lib/api"
import { formatDateTime } from "@/lib/mock-api"
import { cn } from "@/lib/utils"

export const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "CONVERTED", label: "Converted" },
]

const STATUS_TONE: Record<LeadStatus, string> = {
  NEW: "text-primary",
  CONTACTED: "text-warning",
  CONVERTED: "text-success",
}

function LeadStatusSelect({ lead, className }: { lead: ApiLead; className?: string }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (status: LeadStatus) => leadsApi.updateStatus(lead.id, status),
    onSuccess: (updated) => {
      toast.success(`Lead marked as ${LEAD_STATUS_OPTIONS.find((o) => o.value === updated.status)?.label}.`)
      queryClient.invalidateQueries({ queryKey: ["customer-leads"] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update the lead status."),
  })

  return (
    <Select
      value={mutation.isPending && mutation.variables ? mutation.variables : lead.status}
      onValueChange={(value) => mutation.mutate(value as LeadStatus)}
      disabled={mutation.isPending}
    >
      <SelectTrigger size="sm" className={cn("w-[130px] font-medium", STATUS_TONE[lead.status], className)} aria-label="Lead status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEAD_STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

interface LeadsTableProps {
  pageSize?: number
  search?: string
  status?: LeadStatus | ""
  emptyMessage?: string
}

/** Real enquiries from the customer's public profile (newest first), with
 * View Details and status updates. Used by Analytics → Recent Leads and the
 * Enquiries page. Give it a `key` that changes with search/status so a new
 * filter starts again from page 1. */
export function LeadsTable({ pageSize = 10, search = "", status = "", emptyMessage }: LeadsTableProps) {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const query = useQuery({
    queryKey: ["customer-leads", page, pageSize, search, status],
    queryFn: () => leadsApi.list(page, search, { pageSize, status }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }

  const leads = query.data?.items ?? []
  const pagination = query.data?.pagination
  const selected = leads.find((l) => l.id === selectedId) ?? null

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <Inbox className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">No leads yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {emptyMessage ??
            "When someone sends an enquiry from the Contact Us section of your public profile, it will appear here."}
        </p>
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="font-medium">{lead.name}</TableCell>
              <TableCell>
                <a href={`mailto:${lead.email}`} className="text-primary hover:underline">
                  {lead.email || "—"}
                </a>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <a href={`tel:${lead.phone}`} className="hover:underline">
                  {lead.phone || "—"}
                </a>
              </TableCell>
              <TableCell className="max-w-[220px] truncate text-muted-foreground" title={lead.message}>
                {lead.message || "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatDateTime(lead.created_at)}</TableCell>
              <TableCell>
                <LeadStatusSelect lead={lead} />
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => setSelectedId(lead.id)}>
                  <Eye className="size-4" />
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pagination && pagination.num_pages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Page {pagination.page} of {pagination.num_pages} · {pagination.count} leads
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.num_pages}
              onClick={() => setPage((p) => Math.min(pagination.num_pages, p + 1))}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>Enquiry received {formatDateTime(selected.created_at)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <a href={`mailto:${selected.email}`} className="flex items-center gap-2 text-primary hover:underline">
                  <Mail className="size-4" />
                  {selected.email || "—"}
                </a>
                <a href={`tel:${selected.phone}`} className="flex items-center gap-2 hover:underline">
                  <Phone className="size-4" />
                  {selected.phone || "—"}
                </a>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Message</p>
                  <p className="whitespace-pre-wrap break-words">{selected.message || "—"}</p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Status</span>
                  <LeadStatusSelect lead={selected} />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
