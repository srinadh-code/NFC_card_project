import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2, Circle, Mail, MailOpen, MoreHorizontal, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TablePagination } from "@/components/admin/TablePagination"
import { ConfirmDialog } from "@/components/admin/ConfirmDialog"
import { ApiError } from "@/lib/api"
import { contactMessagesApi } from "@/lib/contentApi"
import { cn } from "@/lib/utils"
import type { ContactMessage } from "@/types/content"

const PAGE_SIZE = 10

type ReadFilter = "all" | "read" | "unread"
type ResolvedFilter = "all" | "resolved" | "unresolved"

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  } catch {
    return iso
  }
}

// Contact messages use *server*-side pagination (the backend paginates this
// endpoint) — unlike the client-side slicing every other admin list screen
// in this codebase (e.g. Cards.tsx) uses over an already-fetched full array.
export default function ContactMessagesTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [readFilter, setReadFilter] = useState<ReadFilter>("all")
  const [resolvedFilter, setResolvedFilter] = useState<ResolvedFilter>("all")
  const [viewing, setViewing] = useState<ContactMessage | null>(null)
  const [deleting, setDeleting] = useState<ContactMessage | null>(null)

  const params = {
    page,
    page_size: PAGE_SIZE,
    is_read: readFilter === "all" ? undefined : readFilter === "read",
    is_resolved: resolvedFilter === "all" ? undefined : resolvedFilter === "resolved",
  }

  const { data, isLoading } = useQuery({
    queryKey: ["content", "contact-messages", params],
    queryFn: () => contactMessagesApi.list(params),
  })

  const items = data?.items ?? []
  const pagination = data?.pagination

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["content", "contact-messages"] })

  function reportError(err: unknown, fallback: string) {
    toast.error(err instanceof ApiError ? err.message : fallback)
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { is_read?: boolean; is_resolved?: boolean } }) =>
      contactMessagesApi.update(id, patch),
    onSuccess: (_data, variables) => {
      invalidate()
      if (variables.patch.is_read !== undefined) {
        toast.success(variables.patch.is_read ? "Marked as read." : "Marked as unread.")
      }
      if (variables.patch.is_resolved !== undefined) {
        toast.success(variables.patch.is_resolved ? "Marked as resolved." : "Marked as unresolved.")
      }
    },
    onError: (err) => reportError(err, "Failed to update message."),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => contactMessagesApi.remove(id),
    onSuccess: () => {
      invalidate()
      toast.success("Message deleted.")
      setDeleting(null)
    },
    onError: (err) => reportError(err, "Failed to delete message."),
  })

  function openView(message: ContactMessage) {
    setViewing(message)
    if (!message.is_read) {
      updateMutation.mutate({ id: message.id, patch: { is_read: true } })
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Contact Messages</h2>
            <p className="text-sm text-muted-foreground">{pagination?.count ?? 0} total</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={readFilter}
              onValueChange={(v) => {
                setReadFilter(v as ReadFilter)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Read Status</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={resolvedFilter}
              onValueChange={(v) => {
                setResolvedFilter(v as ResolvedFilter)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resolution Status</SelectItem>
                <SelectItem value="unresolved">Unresolved</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                  <TableHead className="w-8" />
                  <TableHead>From</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((message) => (
                  <TableRow
                    key={message.id}
                    className={cn("cursor-pointer", !message.is_read && "bg-primary/5")}
                    onClick={() => openView(message)}
                  >
                    <TableCell>
                      {!message.is_read && <Circle className="size-2 fill-primary text-primary" />}
                    </TableCell>
                    <TableCell className={cn(!message.is_read && "font-semibold")}>
                      <div className="flex flex-col">
                        <span>{message.name}</span>
                        <span className="text-xs font-normal text-muted-foreground">{message.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className={cn(!message.is_read && "font-semibold")}>{message.subject}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(message.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={message.is_read ? "secondary" : "soft"}>
                          {message.is_read ? "Read" : "Unread"}
                        </Badge>
                        <Badge variant={message.is_resolved ? "success" : "warning"}>
                          {message.is_resolved ? "Resolved" : "Open"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              updateMutation.mutate({ id: message.id, patch: { is_read: !message.is_read } })
                            }
                          >
                            {message.is_read ? <Mail /> : <MailOpen />}
                            {message.is_read ? "Mark Unread" : "Mark Read"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              updateMutation.mutate({
                                id: message.id,
                                patch: { is_resolved: !message.is_resolved },
                              })
                            }
                          >
                            <CheckCircle2 />
                            {message.is_resolved ? "Mark Unresolved" : "Mark Resolved"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(message)}>
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No messages found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <TablePagination
          page={page}
          totalPages={pagination?.num_pages ?? 1}
          onPageChange={setPage}
          totalItems={pagination?.count}
          pageSize={PAGE_SIZE}
        />
      </CardContent>

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.subject}</DialogTitle>
            <DialogDescription>
              {viewing?.name} · {viewing?.email} · {viewing ? formatDate(viewing.created_at) : ""}
            </DialogDescription>
          </DialogHeader>
          <p className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm">{viewing?.message}</p>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!viewing}
              onClick={() =>
                viewing && updateMutation.mutate({ id: viewing.id, patch: { is_resolved: !viewing.is_resolved } })
              }
            >
              {viewing?.is_resolved ? "Mark Unresolved" : "Mark Resolved"}
            </Button>
            <Button onClick={() => setViewing(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete message"
        description={`Are you sure you want to delete the message from ${deleting?.name}? This action cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </Card>
  )
}
