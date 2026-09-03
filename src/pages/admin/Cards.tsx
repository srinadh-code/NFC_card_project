import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  Zap,
  UserPlus,
  Ban,
  MapPinOff,
  Trash2,
} from "lucide-react"
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
import { StatusBadge } from "@/components/admin/StatusBadge"
import { TablePagination } from "@/components/admin/TablePagination"
import { CardFormDialog, type CardFormValues } from "@/components/admin/CardFormDialog"
import { ConfirmDialog } from "@/components/admin/ConfirmDialog"
import { useDataStore } from "@/store/data-store"
import { simulateLatency, formatDate } from "@/lib/mock-api"
import type { CardStatus, NfcCard } from "@/types"

const PAGE_SIZE = 10
const STATUS_OPTIONS: (CardStatus | "All")[] = [
  "All",
  "Active",
  "Assigned",
  "Inactive",
  "Blocked",
  "Lost",
  "Unassigned",
]

export default function AdminCards() {
  const queryClient = useQueryClient()
  const addCard = useDataStore((s) => s.addCard)
  const updateCard = useDataStore((s) => s.updateCard)
  const deleteCard = useDataStore((s) => s.deleteCard)
  const assignCard = useDataStore((s) => s.assignCard)
  const blockCard = useDataStore((s) => s.blockCard)
  const markLost = useDataStore((s) => s.markLost)
  const customers = useDataStore((s) => s.customers)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<CardStatus | "All">("All")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<NfcCard | null>(null)
  const [deleting, setDeleting] = useState<NfcCard | null>(null)
  const [assigning, setAssigning] = useState<NfcCard | null>(null)
  const [assignTarget, setAssignTarget] = useState<string>("")

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["admin-cards"],
    queryFn: () => simulateLatency(useDataStore.getState().cards, 300),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-cards"] })

  const addMutation = useMutation({
    mutationFn: async (values: CardFormValues) => {
      const customer = customers.find((c) => c.id === values.customerId)
      return addCard({
        uid: values.uid || `04${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
        serialNumber: values.serialNumber,
        cardType: values.cardType,
        color: values.color,
        customerId: values.customerId || null,
        customerName: customer?.name ?? null,
        status: values.status,
        assignedOn: values.customerId ? new Date().toISOString() : null,
        activatedOn: values.status === "Active" ? new Date().toISOString() : null,
        purchaseDate: new Date(values.purchaseDate).toISOString(),
        notes: values.notes || undefined,
      })
    },
    onSuccess: () => {
      invalidate()
      toast.success("Card added successfully.")
      setFormOpen(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: CardFormValues }) => {
      const customer = customers.find((c) => c.id === values.customerId)
      updateCard(id, {
        uid: values.uid,
        serialNumber: values.serialNumber,
        cardType: values.cardType,
        color: values.color,
        customerId: values.customerId || null,
        customerName: customer?.name ?? null,
        status: values.status,
        purchaseDate: new Date(values.purchaseDate).toISOString(),
        notes: values.notes || undefined,
      })
    },
    onSuccess: () => {
      invalidate()
      toast.success("Card updated successfully.")
      setFormOpen(false)
      setEditing(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => deleteCard(id),
    onSuccess: () => {
      invalidate()
      toast.success("Card deleted.")
    },
  })

  const activateMutation = useMutation({
    mutationFn: async (id: string) => updateCard(id, { status: "Active", activatedOn: new Date().toISOString() }),
    onSuccess: () => {
      invalidate()
      toast.success("Card activated.")
    },
  })

  const blockMutation = useMutation({
    mutationFn: async (id: string) => blockCard(id),
    onSuccess: () => {
      invalidate()
      toast.success("Card blocked.")
    },
  })

  const lostMutation = useMutation({
    mutationFn: async (id: string) => markLost(id),
    onSuccess: () => {
      invalidate()
      toast.success("Card marked as lost.")
    },
  })

  const assignMutation = useMutation({
    mutationFn: async ({ id, customerId }: { id: string; customerId: string }) => assignCard(id, customerId),
    onSuccess: () => {
      invalidate()
      toast.success("Card assigned to customer.")
      setAssigning(null)
      setAssignTarget("")
    },
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cards.filter((c) => {
      const matchesQuery =
        !q ||
        c.id.toLowerCase().includes(q) ||
        c.uid.toLowerCase().includes(q) ||
        (c.customerName ?? "").toLowerCase().includes(q)
      const matchesStatus = statusFilter === "All" || c.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [cards, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const suggestedSerial = `SN${String(cards.length + 1).padStart(6, "0")}`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">NFC Cards</h1>
          <p className="text-sm text-muted-foreground">{cards.length} cards in inventory</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus /> Add Card
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by card ID, UID, or customer..."
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
                setStatusFilter(v as CardStatus | "All")
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-44">
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
                    <TableHead>Card ID</TableHead>
                    <TableHead>Card UID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Activated On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.id}</TableCell>
                      <TableCell className="text-muted-foreground">{c.uid}</TableCell>
                      <TableCell>{c.cardType}</TableCell>
                      <TableCell>{c.customerName ?? "Unassigned"}</TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.activatedOn ? formatDate(c.activatedOn) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(c)
                                setFormOpen(true)
                              }}
                            >
                              <Eye /> View / Edit
                            </DropdownMenuItem>
                            {c.status !== "Active" && (
                              <DropdownMenuItem onClick={() => activateMutation.mutate(c.id)}>
                                <Zap /> Activate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => {
                                setAssigning(c)
                                setAssignTarget(c.customerId ?? "")
                              }}
                            >
                              <UserPlus /> Assign
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {c.status !== "Blocked" && (
                              <DropdownMenuItem onClick={() => blockMutation.mutate(c.id)}>
                                <Ban /> Block
                              </DropdownMenuItem>
                            )}
                            {c.status !== "Lost" && (
                              <DropdownMenuItem onClick={() => lostMutation.mutate(c.id)}>
                                <MapPinOff /> Mark Lost
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(c)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pageItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        No cards found.
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

      <CardFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        card={editing}
        customers={customers}
        suggestedSerial={suggestedSerial}
        onSubmit={(values) => {
          if (editing) editMutation.mutate({ id: editing.id, values })
          else addMutation.mutate(values)
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete card"
        description={`Are you sure you want to delete card ${deleting?.id}? This action cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />

      <Dialog open={!!assigning} onOpenChange={(open) => !open && setAssigning(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign Card</DialogTitle>
            <DialogDescription>
              Assign card {assigning?.id} to a customer.
            </DialogDescription>
          </DialogHeader>
          <Select value={assignTarget} onValueChange={setAssignTarget}>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button
              disabled={!assignTarget}
              onClick={() => assigning && assignMutation.mutate({ id: assigning.id, customerId: assignTarget })}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
