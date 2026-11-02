import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, ListPlus, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { CUSTOM_FIELD_LABEL_MAX, CUSTOM_FIELD_VALUE_MAX, type CustomFieldErrors } from "@/lib/custom-fields"
import type { CustomField } from "@/types"

interface CustomFieldsEditorProps {
  fields: CustomField[]
  onChange: (fields: CustomField[]) => void
  errors?: CustomFieldErrors
  disabled?: boolean
}

export function CustomFieldsEditor({ fields, onChange, errors = {}, disabled = false }: CustomFieldsEditorProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = fields.findIndex((f) => f.id === active.id)
    const newIndex = fields.findIndex((f) => f.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(fields, oldIndex, newIndex).map((f, i) => ({ ...f, order: i }))
    onChange(reordered)
  }

  function updateField(id: string, patch: Partial<CustomField>) {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function removeField(id: string) {
    onChange(
      fields
        .filter((f) => f.id !== id)
        .map((f, i) => ({ ...f, order: i })),
    )
  }

  function addField() {
    onChange([...fields, { id: crypto.randomUUID(), label: "", value: "", order: fields.length }])
  }

  return (
    <div className="space-y-3">
      {fields.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-8 text-center">
          <ListPlus className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No custom fields yet</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Add anything you want visitors to see, e.g. GST Number, Office Address, Years of Experience, Portfolio
            Link...
          </p>
        </div>
      )}

      {fields.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {fields.map((field) => (
                <SortableFieldRow
                  key={field.id}
                  field={field}
                  error={errors[field.id]}
                  disabled={disabled}
                  onUpdate={updateField}
                  onRemove={removeField}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Button type="button" variant="outline" onClick={addField} disabled={disabled}>
        <Plus /> Add Field
      </Button>
    </div>
  )
}

function SortableFieldRow({
  field,
  error,
  disabled,
  onUpdate,
  onRemove,
}: {
  field: CustomField
  error?: { label?: string; value?: string }
  disabled: boolean
  onUpdate: (id: string, patch: Partial<CustomField>) => void
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const message = error?.label ?? error?.value
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border bg-card p-2",
        isDragging && "z-10 shadow-lg",
        message && "border-destructive/60",
      )}
    >
      <div className="flex items-center gap-2">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Label (e.g. GST Number)"
          aria-label="Field label"
          value={field.label}
          maxLength={CUSTOM_FIELD_LABEL_MAX}
          disabled={disabled}
          aria-invalid={!!error?.label}
          onChange={(e) => onUpdate(field.id, { label: e.target.value })}
          className="flex-1"
        />
        <Input
          placeholder="Value (e.g. 36ABCDE1234F1Z5)"
          aria-label="Field value"
          value={field.value}
          maxLength={CUSTOM_FIELD_VALUE_MAX}
          disabled={disabled}
          aria-invalid={!!error?.value}
          onChange={(e) => onUpdate(field.id, { value: e.target.value })}
          className="flex-1"
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => onRemove(field.id)}
        disabled={disabled}
        aria-label="Remove field"
      >
        <Trash2 className="size-4" />
      </Button>
      </div>
      {message && <p className="mt-1.5 pl-10 text-sm text-destructive">{message}</p>}
    </div>
  )
}
