import { useEffect, useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Search, Plus, Eye, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { TablePagination } from "@/components/admin/TablePagination"
import { useDataStore } from "@/store/data-store"
import { simulateLatency, formatDateTime } from "@/lib/mock-api"
import type { SupportTicket, TicketPriority, TicketStatus } from "@/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10
const STATUS_OPTIONS: (TicketStatus | "All")[] = ["All", "Open", "In Progress", "Resolved", "Closed"]
const PRIORITY_OPTIONS: (TicketPriority | "All")[] = ["All", "Low", "Medium", "High"]

export default function AdminSupport() {
  const queryClient = useQueryClient()
  const customers = useDataStore((s) => s.customers)
  const addTicket = useDataStore((s) => s.addTicket)
  const updateTicketStatus = useDataStore((s) => s.updateTicketStatus)
  const addTicketMessage = useDataStore((s) => s.addTicketMessage)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "All">("All")
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "All">("All")
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState<SupportTicket | null>(null)
  const [reply, setReply] = useState("")
  const [newOpen, setNewOpen] = useState(false)
  const [newTicket, setNewTicket] = useState({
    customerId: "",
    subject: "",
    description: "",
    priority: "Medium" as TicketPriority,
  })

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: () => simulateLatency(useDataStore.getState().tickets, 300),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-tickets"] })

  useEffect(() => {
    if (viewing) {
      const fresh = tickets.find((t) => t.id === viewing.id)
      if (fresh) setViewing(fresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets])

  const createMutation = useMutation({
    mutationFn: async () => {
      const customer = customers.find((c) => c.id === newTicket.customerId)
      if (!customer) throw new Error("Select a customer")
      const now = new Date().toISOString()
      return addTicket({
        customerId: customer.id,
        customerName: customer.name,
        subject: newTicket.subject,
        description: newTicket.description,
        priority: newTicket.priority,
        status: "Open",
        createdOn: now,
        updatedOn: now,
        messages: [{ from: "customer", text: newTicket.description, date: now }],
      })
    },
    onSuccess: () => {
      invalidate()
      toast.success("Ticket logged successfully.")
      setNewOpen(false)
      setNewTicket({ customerId: "", subject: "", description: "", priority: "Medium" })
    },
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TicketStatus }) => updateTicketStatus(id, status),
    onSuccess: (_d, vars) => {
      invalidate()
      toast.success(`Ticket ${vars.id} marked as ${vars.status}.`)
    },
  })

  const replyMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) =>
      addTicketMessage(id, { from: "support", text }),
    onSuccess: () => {
      invalidate()
      toast.success("Reply sent.")
      setReply("")
    },
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tickets.filter((t) => {
      const matchesQuery =
        !q ||
        t.id.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q)
      const matchesStatus = statusFilter === "All" || t.status === statusFilter
      const matchesPriority = priorityFilter === "All" || t.priority === priorityFilter
      return matchesQuery && matchesStatus && matchesPriority
    })
  }, [tickets, search, statusFilter, priorityFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
          <p className="text-sm text-muted-foreground">{tickets.length} tickets total</p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus /> New Ticket
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by ticket ID, customer, or subject..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as TicketStatus | "All")
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "All" ? "All Status" : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={priorityFilter}
              onValueChange={(v) => {
                setPriorityFilter(v as TicketPriority | "All")
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p === "All" ? "All Priority" : p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    <TableHead>Ticket ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.id}</TableCell>
                      <TableCell>{t.customerName}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{t.subject}</TableCell>
                      <TableCell>
                        <StatusBadge status={t.priority} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(t.createdOn)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="View" onClick={() => setViewing(t)}>
                            <Eye className="size-4" />
                          </Button>
                          {t.status !== "Resolved" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Mark Resolved"
                              onClick={() => statusMutation.mutate({ id: t.id, status: "Resolved" })}
                            >
                              <CheckCircle2 className="size-4" />
                            </Button>
                          )}
                          {t.status !== "Closed" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Close Ticket"
                              onClick={() => statusMutation.mutate({ id: t.id, status: "Closed" })}
                            >
                              <XCircle className="size-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pageItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        No tickets found.
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
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
          />
        </CardContent>
      </Card>

      {/* New Ticket */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Ticket</DialogTitle>
            <DialogDescription>Log a support ticket on behalf of a customer.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Customer</Label>
              <Select
                value={newTicket.customerId}
                onValueChange={(v) => setNewTicket((t) => ({ ...t, customerId: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Subject</Label>
              <Input
                value={newTicket.subject}
                onChange={(e) => setNewTicket((t) => ({ ...t, subject: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <Select
                value={newTicket.priority}
                onValueChange={(v) => setNewTicket((t) => ({ ...t, priority: v as TicketPriority }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea
                value={newTicket.description}
                onChange={(e) => setNewTicket((t) => ({ ...t, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newTicket.customerId || !newTicket.subject || !newTicket.description}
              onClick={() => createMutation.mutate()}
            >
              Create Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Ticket */}
      <Sheet open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <SheetContent className="flex w-full flex-col sm:max-w-lg">
          {viewing && (
            <>
              <SheetHeader>
                <SheetTitle>{viewing.subject}</SheetTitle>
                <SheetDescription>
                  {viewing.id} • {viewing.customerName}
                </SheetDescription>
              </SheetHeader>

              <div className="flex items-center justify-between gap-3 px-4">
                <div className="flex items-center gap-2">
                  <StatusBadge status={viewing.priority} />
                  <StatusBadge status={viewing.status} />
                </div>
                <Select
                  value={viewing.status}
                  onValueChange={(v) => statusMutation.mutate({ id: viewing.id, status: v as TicketStatus })}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.filter((s) => s !== "All").map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator className="mt-2" />

              <div className="flex-1 space-y-3 overflow-y-auto px-4">
                {viewing.messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      m.from === "support" ? "ml-auto bg-primary/10 text-foreground" : "bg-muted",
                    )}
                  >
                    <p>{m.text}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {m.from === "support" ? "Support" : viewing.customerName} • {formatDateTime(m.date)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 border-t p-4">
                <Textarea
                  placeholder="Type a reply..."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                />
                <Button
                  disabled={!reply.trim()}
                  onClick={() => reply.trim() && replyMutation.mutate({ id: viewing.id, text: reply.trim() })}
                >
                  Send Reply
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
