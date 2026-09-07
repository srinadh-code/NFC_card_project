import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { profileApi } from "@/lib/api"
import { getSocialIcon } from "@/components/customer/social-icons"
import { ProfileNotReady } from "@/components/customer/ProfileNotReady"
import { useEnsuredProfile } from "@/hooks/use-ensured-profile"
import type { CustomLink, SocialLink } from "@/types"

function isValidUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return true
  try {
    const u = new URL(trimmed)
    return Boolean(u.protocol.startsWith("http") && u.host)
  } catch {
    return false
  }
}

function bySortOrder<T extends { order: number }>(list: T[]) {
  return [...list].sort((a, b) => a.order - b.order)
}

function reindex<T extends { order: number }>(list: T[]): T[] {
  return list.map((item, i) => ({ ...item, order: i }))
}

// --- Draggable rows ---------------------------------------------------

function SortableSocialRow({
  link,
  error,
  onUrlChange,
  onToggle,
}: {
  link: SocialLink
  error: string | null
  onUrlChange: (platform: SocialLink["platform"], url: string) => void
  onToggle: (platform: SocialLink["platform"]) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.platform })
  const Icon = getSocialIcon(link.platform)
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-xl border p-3 ${isDragging ? "z-10 bg-muted/60 shadow-md" : "bg-background"}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{link.platform}</p>
        <Input
          value={link.url}
          onChange={(e) => onUrlChange(link.platform, e.target.value)}
          placeholder={`Your ${link.platform} URL`}
          className={`h-8 text-sm ${error ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
          aria-invalid={Boolean(error)}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <Switch checked={link.enabled} onCheckedChange={() => onToggle(link.platform)} />
    </div>
  )
}

function SortableCustomRow({
  link,
  error,
  onChange,
  onToggle,
  onDelete,
}: {
  link: CustomLink
  error: string | null
  onChange: (id: string, patch: Partial<CustomLink>) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl border p-3 ${isDragging ? "z-10 bg-muted/60 shadow-md" : "bg-background"}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          value={link.label}
          placeholder="Label (e.g. Portfolio)"
          className="h-8 text-sm"
          onChange={(e) => onChange(link.id, { label: e.target.value })}
        />
        <div className="space-y-1">
          <Input
            value={link.url}
            placeholder="https://..."
            className={`h-8 text-sm ${error ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
            aria-invalid={Boolean(error)}
            onChange={(e) => onChange(link.id, { url: e.target.value })}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
      <Switch checked={link.enabled} onCheckedChange={() => onToggle(link.id)} />
      <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(link.id)} aria-label="Remove link">
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  )
}

// --- Page ---------------------------------------------------------------

export default function CustomerSocialLinks() {
  const { customer, profile, stuck, retry } = useEnsuredProfile()
  const queryClient = useQueryClient()

  function refreshProfile() {
    queryClient.invalidateQueries({ queryKey: ["profile-me"] })
  }

  const [socialLinks, setSocialLinks] = useState<SocialLink[] | null>(null)
  const [customLinks, setCustomLinks] = useState<CustomLink[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [newUrl, setNewUrl] = useState("")

  useEffect(() => {
    if (profile && socialLinks === null) setSocialLinks(bySortOrder(profile.socialLinks))
    if (profile && customLinks === null) setCustomLinks(bySortOrder(profile.customLinks))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  if (!customer) return null

  if (stuck) {
    return (
      <div className="mx-auto max-w-3xl">
        <ProfileNotReady onRetry={retry} />
      </div>
    )
  }

  if (!profile || !socialLinks || !customLinks) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  const socialErrors = new Map<string, string | null>(
    socialLinks.map((l) => [l.platform, l.enabled && !isValidUrl(l.url) ? "Enter a valid URL" : null]),
  )
  const customErrors = new Map<string, string | null>(
    customLinks.map((l) => [l.id, l.enabled && !isValidUrl(l.url) ? "Enter a valid URL" : null]),
  )
  const hasBlockingError =
    Array.from(socialErrors.values()).some(Boolean) || Array.from(customErrors.values()).some(Boolean)

  function handleSocialUrlChange(platform: SocialLink["platform"], url: string) {
    setSocialLinks((prev) => prev && prev.map((l) => (l.platform === platform ? { ...l, url } : l)))
  }

  function handleSocialToggle(platform: SocialLink["platform"]) {
    setSocialLinks((prev) => prev && prev.map((l) => (l.platform === platform ? { ...l, enabled: !l.enabled } : l)))
  }

  function handleCustomChange(id: string, patch: Partial<CustomLink>) {
    setCustomLinks((prev) => prev && prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function handleCustomToggle(id: string) {
    setCustomLinks((prev) => prev && prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)))
  }

  async function handleCustomDelete(id: string) {
    if (!customLinks) return
    const next = reindex(customLinks.filter((l) => l.id !== id))
    setCustomLinks(next)
    try {
      await profileApi.saveCustomLinks(next)
      toast.success("Link removed.")
      refreshProfile()
    } catch {
      toast.error("Couldn't remove the link. Please try again.")
    }
  }

  async function handleAddCustomLink() {
    const label = newLabel.trim()
    const url = newUrl.trim()
    if (!label || !url) {
      toast.error("Give the link a label and a URL.")
      return
    }
    if (!isValidUrl(url)) {
      toast.error("That URL doesn't look valid.")
      return
    }
    const base = customLinks ?? []
    const next: CustomLink[] = [...base, { id: `new-${Date.now()}`, label, url, enabled: true, order: base.length }]
    setCustomLinks(next)
    setNewLabel("")
    setNewUrl("")
    setAddOpen(false)
    try {
      await profileApi.saveCustomLinks(next)
      toast.success("Custom link added.")
      refreshProfile()
    } catch {
      toast.error("Couldn't add the link. Please try again.")
    }
  }

  async function handleSocialDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !socialLinks) return
    const oldIndex = socialLinks.findIndex((l) => l.platform === active.id)
    const newIndex = socialLinks.findIndex((l) => l.platform === over.id)
    const next = reindex(arrayMove(socialLinks, oldIndex, newIndex))
    setSocialLinks(next)
    try {
      await profileApi.saveSocialLinks(next)
      toast.success("Order updated.")
    } catch {
      toast.error("Couldn't save the new order. Please try again.")
    }
  }

  async function handleCustomDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !customLinks) return
    const oldIndex = customLinks.findIndex((l) => l.id === active.id)
    const newIndex = customLinks.findIndex((l) => l.id === over.id)
    const next = reindex(arrayMove(customLinks, oldIndex, newIndex))
    setCustomLinks(next)
    try {
      await profileApi.saveCustomLinks(next)
      toast.success("Order updated.")
      refreshProfile()
    } catch {
      toast.error("Couldn't save the new order. Please try again.")
    }
  }

  async function handleSave() {
    if (!profile || !socialLinks || !customLinks) return
    if (hasBlockingError) {
      toast.error("Fix the invalid URLs before saving — disable the link or correct its URL.")
      return
    }
    setSaving(true)
    try {
      await profileApi.saveSocialLinks(socialLinks)
      await profileApi.saveCustomLinks(customLinks)
      toast.success("Social links saved.")
      refreshProfile()
    } catch {
      toast.error("Something went wrong while saving. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Social Links</h1>
        <p className="text-sm text-muted-foreground">
          Drag to reorder, toggle to show or hide, and edit the links on your public profile.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Your Platforms</CardTitle>
          <CardDescription>Drag the handle to reorder — changes to order save instantly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSocialDragEnd}>
            <SortableContext items={socialLinks.map((l) => l.platform)} strategy={verticalListSortingStrategy}>
              {socialLinks.map((link) => (
                <SortableSocialRow
                  key={link.platform}
                  link={link}
                  error={socialErrors.get(link.platform) ?? null}
                  onUrlChange={handleSocialUrlChange}
                  onToggle={handleSocialToggle}
                />
              ))}
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Custom Links</CardTitle>
          <CardDescription>Add extra links, like a portfolio or booking page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {customLinks.length === 0 ? (
            <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              No custom links yet.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCustomDragEnd}>
              <SortableContext items={customLinks.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                {customLinks.map((link) => (
                  <SortableCustomRow
                    key={link.id}
                    link={link}
                    error={customErrors.get(link.id) ?? null}
                    onChange={handleCustomChange}
                    onToggle={handleCustomToggle}
                    onDelete={handleCustomDelete}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
          <Button type="button" variant="soft" onClick={() => setAddOpen(true)}>
            <Plus /> Add Custom Link
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Links"}
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Link</DialogTitle>
            <DialogDescription>Add a portfolio page, booking link, or anything else.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-link-label">Label</Label>
              <Input
                id="new-link-label"
                placeholder="e.g. Portfolio"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-link-url">URL</Label>
              <Input
                id="new-link-url"
                placeholder="https://..."
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCustomLink}>Add Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
