import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query"
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
import { PlanTypeBadge } from "@/components/admin/PlanTypeBadge"
import { TablePagination } from "@/components/admin/TablePagination"
import { CardFormDialog, type CardFormValues } from "@/components/admin/CardFormDialog"
import { CustomerPicker } from "@/components/admin/CustomerPicker"
import { ConfirmDialog } from "@/components/admin/ConfirmDialog"
import { adminNfcApi, ApiError } from "@/lib/api"
import { formatDate } from "@/lib/mock-api"
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

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

export default function AdminCards() {
  const queryClient = useQueryClient()

  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<CardStatus | "All">("All")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<NfcCard | null>(null)
  const [deleting, setDeleting] = useState<NfcCard | null>(null)
  const [assigning, setAssigning] = useState<NfcCard | null>(null)
  const [assignEmail, setAssignEmail] = useState("")

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-cards", page, search, statusFilter],
    queryFn: () => adminNfcApi.list({ page, search: search || undefined, status: statusFilter }),
    placeholderData: keepPreviousData,
  })

  const cards = data?.data ?? []
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-cards"] })

  const addMutation = useMutation({
    mutationFn: (values: CardFormValues) =>
      adminNfcApi.create({
        uid: values.uid || undefined,
        serialNumber: values.serialNumber || undefined,
        cardType: values.cardType,
        color: values.color,
        status: values.status,
        purchaseDate: values.purchaseDate,
        notes: values.notes,
        customerEmail: values.customerEmail,
      }),
    onSuccess: () => {
      invalidate()
      toast.success("Card added successfully.")
      setFormOpen(false)
    },
    onError: (err) => toast.error(errorMessage(err, "Could not add card.")),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: CardFormValues }) =>
      adminNfcApi.update(id, {
        uid: values.uid,
        serialNumber: values.serialNumber,
        cardType: values.cardType,
        color: values.color,
        status: values.status,
        purchaseDate: values.purchaseDate,
        notes: values.notes,
        customerEmail: values.customerEmail,
      }),
    onSuccess: () => {
      invalidate()
      toast.success("Card updated successfully.")
      setFormOpen(false)
      setEditing(null)
    },
    onError: (err) => toast.error(errorMessage(err, "Could not update card.")),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminNfcApi.remove(id),
    onSuccess: () => {
      invalidate()
      toast.success("Card deleted.")
      setDeleting(null)
    },
    onError: (err) => toast.error(errorMessage(err, "Could not delete card.")),
  })

  const activateMutation = useMutation({
    mutationFn: (id: string) => adminNfcApi.activate(id),
    onSuccess: () => {
      invalidate()
      toast.success("Card activated.")
    },
    onError: (err) => toast.error(errorMessage(err, "Could not activate card.")),
  })

  const blockMutation = useMutation({
    mutationFn: (id: string) => adminNfcApi.block(id),
    onSuccess: () => {
      invalidate()
      toast.success("Card blocked.")
    },
    onError: (err) => toast.error(errorMessage(err, "Could not block card.")),
  })

  const lostMutation = useMutation({
    mutationFn: (id: string) => adminNfcApi.markLost(id),
    onSuccess: () => {
      invalidate()
      toast.success("Card marked as lost.")
    },
    onError: (err) => toast.error(errorMessage(err, "Could not update card.")),
  })

  const assignMutation = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) => adminNfcApi.assign(id, email),
    onSuccess: () => {
      invalidate()
      toast.success("Card assigned to customer.")
      setAssigning(null)
      setAssignEmail("")
    },
    onError: (err) => toast.error(errorMessage(err, "Could not assign card.")),
  })

  const totalItems = data?.count ?? 0
  const totalPages = Math.max(1, data?.numPages ?? 1)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">NFC Cards</h1>
          <p className="text-sm text-muted-foreground">{totalItems} cards in inventory</p>
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
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
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
                <TableBody className={isFetching ? "opacity-60" : undefined}>
                  {cards.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.id}</TableCell>
                      <TableCell className="text-muted-foreground">{c.uid}</TableCell>
                      <TableCell>
                        <PlanTypeBadge cardType={c.cardType} />
                      </TableCell>
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
                                setAssignEmail(c.customerEmail ?? "")
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
                  {cards.length === 0 && (
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
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
          />
        </CardContent>
      </Card>

      <CardFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        card={editing}
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
            <DialogDescription>Assign card {assigning?.id} to a customer.</DialogDescription>
          </DialogHeader>
          <CustomerPicker value={assignEmail} onChange={setAssignEmail} placeholder="Select a customer..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button
              disabled={!assignEmail || assignMutation.isPending}
              onClick={() => assigning && assignMutation.mutate({ id: assigning.id, email: assignEmail })}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
