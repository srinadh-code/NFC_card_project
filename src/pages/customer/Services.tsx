import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Briefcase, GripVertical, Plus, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorState } from "@/components/customer/ErrorState"
import { servicesApi } from "@/lib/api"
import type { Service } from "@/types"

function SortableServiceRow({
  service,
  onChange,
  onToggle,
  onDelete,
}: {
  service: Service
  onChange: (id: string, patch: Partial<Service>) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: service.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 rounded-xl border bg-card p-3 ${isDragging ? "z-10 shadow-lg" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-2 flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="grid min-w-0 flex-1 gap-2">
        <Input
          placeholder="Service title (e.g. Web Development)"
          value={service.title}
          onChange={(e) => onChange(service.id, { title: e.target.value })}
        />
        <Textarea
          placeholder="Short description (optional)"
          rows={2}
          value={service.description}
          onChange={(e) => onChange(service.id, { description: e.target.value })}
        />
      </div>
      <div className="flex shrink-0 flex-col items-center gap-2 pt-1">
        <Switch checked={service.isActive} onCheckedChange={() => onToggle(service.id)} aria-label="Show on public profile" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDelete(service.id)}
          aria-label="Remove service"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

export default function CustomerServices() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ["customer-services"], queryFn: servicesApi.list })

  const [services, setServices] = useState<Service[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDescription, setNewDescription] = useState("")

  useEffect(() => {
    if (query.data) setServices(query.data)
  }, [query.data])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["customer-services"] })
  }

  const createMutation = useMutation({
    mutationFn: () => servicesApi.create({ title: newTitle.trim(), description: newDescription.trim() }),
    onSuccess: () => {
      toast.success("Service added.")
      setNewTitle("")
      setNewDescription("")
      setAddOpen(false)
      refresh()
    },
    onError: () => toast.error("Couldn't add that service. Please try again."),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => servicesApi.remove(id),
    onSuccess: () => {
      toast.success("Service removed.")
      refresh()
    },
    onError: () => toast.error("Couldn't remove that service. Please try again."),
  })

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => servicesApi.reorder(orderedIds),
    onError: () => toast.error("Couldn't save the new order. Please try again."),
  })

  function handleChange(id: string, patch: Partial<Service>) {
    setServices((prev) => prev && prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function handleToggle(id: string) {
    setServices((prev) => prev && prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s)))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !services) return
    const oldIndex = services.findIndex((s) => s.id === active.id)
    const newIndex = services.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(services, oldIndex, newIndex).map((s, i) => ({ ...s, order: i }))
    setServices(reordered)
    reorderMutation.mutate(reordered.map((s) => s.id))
  }

  async function handleSave() {
    if (!services) return
    setSaving(true)
    try {
      await Promise.all(
        services.map((s) =>
          servicesApi.update(s.id, { title: s.title, description: s.description, isActive: s.isActive }),
        ),
      )
      toast.success("Services saved.")
      refresh()
    } catch {
      toast.error("Something went wrong while saving. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Services</h1>
          <p className="text-sm text-muted-foreground">
            Showcase what you offer on your public profile — shown right below your Visit Website button.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus /> Add Service
        </Button>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Your Services</CardTitle>
          <CardDescription>Toggle off to hide a service without deleting it. Drag to reorder.</CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading || !services ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : services.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
              <Briefcase className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">No services yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Add what you offer, e.g. Web Development, Mobile App Development, Digital Marketing...
              </p>
              <Button className="mt-2" onClick={() => setAddOpen(true)}>
                <Plus /> Add Your First Service
              </Button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={services.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {services.map((service) => (
                    <SortableServiceRow
                      key={service.id}
                      service={service}
                      onChange={handleChange}
                      onToggle={handleToggle}
                      onDelete={(id) => deleteMutation.mutate(id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {services && services.length > 0 && (
        <div className="flex justify-end">
          <Button size="lg" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Service</DialogTitle>
            <DialogDescription>Describe one thing you offer — you can add more anytime.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-service-title">Service Title</Label>
              <Input
                id="new-service-title"
                placeholder="e.g. Web Development"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-service-description">Service Description</Label>
              <Textarea
                id="new-service-description"
                placeholder="e.g. Custom websites and portals"
                rows={3}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newTitle.trim()}
            >
              {createMutation.isPending ? "Adding..." : "Add Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
