import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Search, Plus, Download, Eye, Pencil, Trash2, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { TablePagination } from "@/components/admin/TablePagination"
import { CustomerFormDialog, type CustomerFormValues } from "@/components/admin/CustomerFormDialog"
import { ConfirmDialog } from "@/components/admin/ConfirmDialog"
import { downloadCsv } from "@/components/admin/export-csv"
import { useDataStore } from "@/store/data-store"
import { simulateLatency, formatDate, formatCurrency } from "@/lib/mock-api"
import type { Customer, CustomerStatus } from "@/types"

const PAGE_SIZE = 10

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 14)
}

export default function AdminCustomers() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const addCustomer = useDataStore((s) => s.addCustomer)
  const updateCustomer = useDataStore((s) => s.updateCustomer)
  const deleteCustomer = useDataStore((s) => s.deleteCustomer)
  const storeCustomers = useDataStore((s) => s.customers)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"All" | CustomerStatus>("All")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState<Customer | null>(null)

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: () => simulateLatency(useDataStore.getState().customers, 300),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-customers"] })

  const addMutation = useMutation({
    mutationFn: async (values: CustomerFormValues) => {
      let base = slugify(values.name) || "user"
      const existing = new Set(storeCustomers.map((c) => c.username))
      let username = base
      let i = 1
      while (existing.has(username)) username = `${base}${i++}`
      return addCustomer({
        name: values.name,
        email: values.email,
        phone: values.phone,
        company: values.company,
        designation: values.designation,
        address: {
          line1: values.line1,
          city: values.city,
          state: values.state,
          pincode: values.pincode,
          country: values.country,
        },
        profileUrl: `vrsnexora.com/u/${username}`,
        username,
        status: values.status,
        avatar: `https://api.dicebear.com/9.x/notionists/svg?seed=${username}`,
        joinedOn: new Date().toISOString(),
      })
    },
    onSuccess: () => {
      invalidate()
      toast.success("Customer added successfully.")
      setFormOpen(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: CustomerFormValues }) => {
      updateCustomer(id, {
        name: values.name,
        email: values.email,
        phone: values.phone,
        company: values.company,
        designation: values.designation,
        status: values.status,
        address: {
          line1: values.line1,
          city: values.city,
          state: values.state,
          pincode: values.pincode,
          country: values.country,
        },
      })
    },
    onSuccess: () => {
      invalidate()
      toast.success("Customer updated successfully.")
      setFormOpen(false)
      setEditing(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => deleteCustomer(id),
    onSuccess: () => {
      invalidate()
      toast.success("Customer deleted.")
    },
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers.filter((c) => {
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      const matchesStatus = statusFilter === "All" || c.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [customers, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function resetPage() {
    setPage(1)
  }

  function handleExport() {
    downloadCsv(
      `customers-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((c) => ({
        ID: c.id,
        Name: c.name,
        Email: c.email,
        Phone: c.phone,
        Company: c.company,
        Status: c.status,
        JoinedOn: formatDate(c.joinedOn),
        TotalOrders: c.totalOrders,
        TotalSpent: c.totalSpent,
      })),
    )
    toast.success("Customers exported to CSV.")
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            {formatCurrency(customers.reduce((s, c) => s + c.totalSpent, 0))} total spent across{" "}
            {customers.length} customers
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download /> Export
          </Button>
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus /> Add Customer
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or ID..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  resetPage()
                }}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as typeof statusFilter)
                resetPage()
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
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
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.id}</TableCell>
                      <TableCell>
                        <button
                          className="flex items-center gap-2 text-left hover:underline"
                          onClick={() => navigate(`/admin/customers/${c.id}`)}
                        >
                          <Avatar className="size-7">
                            <AvatarImage src={c.avatar} alt={c.name} />
                            <AvatarFallback>{c.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          {c.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.email}</TableCell>
                      <TableCell className="text-muted-foreground">{c.phone}</TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(c.joinedOn)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/admin/customers/${c.id}`)}>
                              <Eye /> View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(c)
                                setFormOpen(true)
                              }}
                            >
                              <Pencil /> Edit
                            </DropdownMenuItem>
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
                        No customers found.
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

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editing}
        onSubmit={(values) => {
          if (editing) editMutation.mutate({ id: editing.id, values })
          else addMutation.mutate(values)
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete customer"
        description={`Are you sure you want to delete ${deleting?.name}? This action cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  )
}
