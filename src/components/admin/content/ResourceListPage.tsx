import { useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { TableCell, TableHead } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/admin/ConfirmDialog"
import { ReorderableTable } from "@/components/admin/content/ReorderableTable"
import { ApiError } from "@/lib/api"
import type { WithId } from "@/types/content"

export interface ResourceColumn<T> {
  key: string
  label: string
  className?: string
  render: (item: T) => ReactNode
}

export interface ResourceApi<T> {
  list: (query?: Record<string, string | number | boolean | undefined>) => Promise<T[]>
  create: (body: Partial<T>) => Promise<T>
  update: (id: number, body: Partial<T>) => Promise<T>
  remove: (id: number) => Promise<void>
  reorder?: (order: number[]) => Promise<void>
}

export interface ResourceListPageProps<T extends WithId & { is_active: boolean }> {
  api: ResourceApi<T>
  queryKey: QueryKey
  listParams?: Record<string, string | number | boolean | undefined>
  resourceLabel: string
  description?: string
  columns: ResourceColumn<T>[]
  getRowLabel: (item: T) => string
  createDefaults: (existing: T[]) => Partial<T>
  toEditValues?: (item: T) => Partial<T>
  renderForm: (args: {
    values: Partial<T>
    setField: <K extends keyof T>(key: K, value: T[K]) => void
  }) => ReactNode
  reorderable?: boolean
  searchPredicate?: (item: T, query: string) => boolean
  searchPlaceholder?: string
  dialogClassName?: string
  headerExtra?: ReactNode
}

// Generic list-management screen every simple collection tab (Values,
// Features, HowItWorks, FAQs, Testimonials, Companies, Statistics, and the
// various mini feature-highlight collections) configures instead of
// hand-rolling its own table+dialog+mutation block. Drives everything from
// the real backend via the `api` functions passed in (see lib/contentApi.ts)
// — never optimistic, never a mock store.
export function ResourceListPage<T extends WithId & { is_active: boolean }>({
  api,
  queryKey,
  listParams,
  resourceLabel,
  description,
  columns,
  getRowLabel,
  createDefaults,
  toEditValues = (item) => ({ ...item }),
  renderForm,
  reorderable = true,
  searchPredicate,
  searchPlaceholder,
  dialogClassName,
  headerExtra,
}: ResourceListPageProps<T>) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const [values, setValues] = useState<Partial<T>>({})
  const [deleting, setDeleting] = useState<T | null>(null)

  const fullQueryKey = [...queryKey, listParams ?? null]

  const { data: items = [], isLoading } = useQuery({
    queryKey: fullQueryKey,
    queryFn: () => api.list(listParams),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  function reportError(err: unknown, fallback: string) {
    toast.error(err instanceof ApiError ? err.message : fallback)
  }

  const createMutation = useMutation({
    mutationFn: (body: Partial<T>) => api.create(body),
    onSuccess: () => {
      invalidate()
      toast.success(`${resourceLabel} added.`)
      setFormOpen(false)
    },
    onError: (err) => reportError(err, `Failed to add ${resourceLabel.toLowerCase()}.`),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<T> }) => api.update(id, body),
    onSuccess: () => {
      invalidate()
      toast.success(`${resourceLabel} updated.`)
      setFormOpen(false)
      setEditing(null)
    },
    onError: (err) => reportError(err, `Failed to update ${resourceLabel.toLowerCase()}.`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.remove(id),
    onSuccess: () => {
      invalidate()
      toast.success(`${resourceLabel} deleted.`)
    },
    onError: (err) => reportError(err, `Failed to delete ${resourceLabel.toLowerCase()}.`),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.update(id, { is_active } as Partial<T>),
    onSuccess: () => invalidate(),
    onError: (err) => reportError(err, "Failed to update status."),
  })

  const reorderMutation = useMutation({
    mutationFn: (order: number[]) => {
      if (!api.reorder) return Promise.resolve()
      return api.reorder(order)
    },
    onSuccess: () => {
      invalidate()
      toast.success("Order updated.")
    },
    onError: (err) => reportError(err, "Failed to reorder."),
  })

  const filtered = useMemo(() => {
    if (!searchPredicate || !search.trim()) return items
    const q = search.trim().toLowerCase()
    return items.filter((item) => searchPredicate(item, q))
  }, [items, search, searchPredicate])

  function openCreate() {
    setEditing(null)
    setValues(createDefaults(items))
    setFormOpen(true)
  }
  function openEdit(item: T) {
    setEditing(item)
    setValues(toEditValues(item))
    setFormOpen(true)
  }
  function setField<K extends keyof T>(key: K, value: T[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }
  function handleSubmit() {
    if (editing) updateMutation.mutate({ id: editing.id, body: values })
    else createMutation.mutate(values)
  }

  const saving = createMutation.isPending || updateMutation.isPending
  const columnCount = columns.length + 2 // + Active + Actions

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{resourceLabel}s</h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
            <p className="text-xs text-muted-foreground">{items.length} total</p>
          </div>
          <div className="flex items-center gap-2">
            {headerExtra}
            <Button onClick={openCreate}>
              <Plus /> Add {resourceLabel}
            </Button>
          </div>
        </div>

        {searchPredicate && (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder ?? `Search ${resourceLabel.toLowerCase()}s...`}
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <ReorderableTable
              items={filtered}
              draggable={reorderable && !!api.reorder && !(searchPredicate && search.trim())}
              onReorder={(order) => reorderMutation.mutate(order)}
              colSpan={columnCount}
              emptyMessage={`No ${resourceLabel.toLowerCase()}s yet.`}
              renderHeader={() => (
                <>
                  {columns.map((c) => (
                    <TableHead key={c.key} className={c.className}>
                      {c.label}
                    </TableHead>
                  ))}
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </>
              )}
              renderRow={(item) => (
                <>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {c.render(item)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Switch
                      checked={item.is_active}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: item.id, is_active: checked })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(item)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting(item)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </>
              )}
            />
          </div>
        )}
      </CardContent>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className={dialogClassName ?? "sm:max-w-lg"}>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${resourceLabel}` : `Add ${resourceLabel}`}</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto px-1 py-1 sm:grid-cols-2">
            {renderForm({ values, setField })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {editing ? "Save Changes" : `Add ${resourceLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${resourceLabel.toLowerCase()}`}
        description={`Are you sure you want to delete "${deleting ? getRowLabel(deleting) : ""}"? This action cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </Card>
  )
}
