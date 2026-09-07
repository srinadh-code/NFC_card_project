import { useEffect, useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Search, Plus, Eye, Pencil, Ban, CheckCircle2, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
import { adminProfileApi, adminCustomerApi } from "@/lib/api"
import { formatDate } from "@/lib/mock-api"
import type { Profile } from "@/types"

const PAGE_SIZE = 10

export default function AdminProfiles() {
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [addOpen, setAddOpen] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState("")
  const [viewing, setViewing] = useState<Profile | null>(null)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [editValues, setEditValues] = useState({
    fullName: "",
    designation: "",
    company: "",
    email: "",
    phone: "",
    bio: "",
  })

  const { data, isLoading } = useQuery({
    queryKey: ["admin-profiles", search],
    queryFn: () => adminProfileApi.list({ search: search || undefined }),
  })
  const profiles = data?.data ?? []

  // Every customer already has a profile from registration — this dialog
  // only matters for the rare legacy account that predates that, so a
  // single large customer page is enough for the picker.
  const { data: customerPage } = useQuery({
    queryKey: ["admin-customers-for-profile"],
    queryFn: () => adminCustomerApi.list({}),
  })
  const customers = customerPage?.data ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-profiles"] })

  // AdminProfileSerializer doesn't expose the underlying user id (only the
  // profile's own pk, which lives in a separate id space) — email is the
  // one field both sides share and is unique per user, so match on that.
  const customersWithoutProfile = useMemo(
    () => customers.filter((c) => !profiles.some((p) => p.email === c.email)),
    [customers, profiles],
  )

  const addMutation = useMutation({
    mutationFn: (customerId: string) => adminProfileApi.create(customerId),
    onSuccess: () => {
      invalidate()
      toast.success("Profile created for customer.")
      setAddOpen(false)
      setSelectedCustomerId("")
    },
    onError: () => toast.error("Couldn't create the profile. Please try again."),
  })

  const editMutation = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("No profile selected")
      return adminProfileApi.update(editing.id, editValues)
    },
    onSuccess: () => {
      invalidate()
      toast.success("Profile updated successfully.")
      setEditing(null)
    },
    onError: () => toast.error("Couldn't update the profile. Please try again."),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Profile["status"] }) =>
      status === "Active" ? adminProfileApi.activate(id) : adminProfileApi.suspend(id),
    onSuccess: (_d, vars) => {
      invalidate()
      toast.success(`Profile ${vars.status === "Active" ? "activated" : "suspended"}.`)
    },
    onError: () => toast.error("Couldn't update the profile status. Please try again."),
  })

  useEffect(() => {
    if (editing) {
      setEditValues({
        fullName: editing.fullName,
        designation: editing.designation,
        company: editing.company,
        email: editing.email,
        phone: editing.phone,
        bio: editing.bio,
      })
    }
  }, [editing])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return profiles
    return profiles.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    )
  }, [profiles, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profiles</h1>
          <p className="text-sm text-muted-foreground">{profiles.length} digital profiles</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus /> Add Profile
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, username, or ID..."
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
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
                    <TableHead>Profile ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Profile Link</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-7">
                            <AvatarImage src={p.avatar} alt={p.fullName} />
                            <AvatarFallback>{p.fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          {p.fullName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <a
                          href={`/u/${p.username}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          /u/{p.username} <ExternalLink className="size-3" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(p.createdOn)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setViewing(p)} title="View">
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setEditing(p)} title="Edit">
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={p.status === "Active" ? "Suspend" : "Activate"}
                            onClick={() =>
                              statusMutation.mutate({
                                id: p.id,
                                status: p.status === "Active" ? "Suspended" : "Active",
                              })
                            }
                          >
                            {p.status === "Active" ? (
                              <Ban className="size-4" />
                            ) : (
                              <CheckCircle2 className="size-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pageItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No profiles found.
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

      {/* Add Profile */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Profile</DialogTitle>
            <DialogDescription>
              Profiles are normally auto-created when a customer activates their first NFC card.
              Pick a customer without a profile to create one manually.
            </DialogDescription>
          </DialogHeader>
          {customersWithoutProfile.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every customer already has a profile.
            </p>
          ) : (
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a customer" />
              </SelectTrigger>
              <SelectContent>
                {customersWithoutProfile.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedCustomerId}
              onClick={() => selectedCustomerId && addMutation.mutate(selectedCustomerId)}
            >
              Create Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Profile */}
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-md">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>{viewing.fullName}</DialogTitle>
                <DialogDescription>@{viewing.username}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Avatar className="size-14">
                    <AvatarImage src={viewing.avatar} alt={viewing.fullName} />
                    <AvatarFallback>{viewing.fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      {viewing.designation} at {viewing.company}
                    </p>
                    <p className="text-sm text-muted-foreground">{viewing.email}</p>
                    <p className="text-sm text-muted-foreground">{viewing.phone}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{viewing.bio}</p>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">Social Links</p>
                  <div className="flex flex-wrap gap-2">
                    {viewing.socialLinks.map((l) => (
                      <Badge key={l.platform} variant={l.enabled ? "soft" : "outline"}>
                        {l.platform}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Profile */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Full Name</Label>
              <Input
                value={editValues.fullName}
                onChange={(e) => setEditValues((v) => ({ ...v, fullName: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Designation</Label>
              <Input
                value={editValues.designation}
                onChange={(e) => setEditValues((v) => ({ ...v, designation: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Company</Label>
              <Input
                value={editValues.company}
                onChange={(e) => setEditValues((v) => ({ ...v, company: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input
                value={editValues.email}
                onChange={(e) => setEditValues((v) => ({ ...v, email: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <Input
                value={editValues.phone}
                onChange={(e) => setEditValues((v) => ({ ...v, phone: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Bio</Label>
              <Textarea
                value={editValues.bio}
                onChange={(e) => setEditValues((v) => ({ ...v, bio: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => editMutation.mutate()}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
