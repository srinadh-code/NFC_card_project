import type { ReactNode } from "react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Vertical drag-to-reorder wrapper around the shared Table primitives. The
// caller supplies arbitrary row/header content via render props; this
// component owns the drag-handle column, sortable wiring, and firing
// onReorder with the full new ordered id list on drop.
function SortableRow({ id, children }: { id: number; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-8">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      {children}
    </TableRow>
  )
}

export function ReorderableTable<T extends { id: number }>({
  items,
  onReorder,
  renderHeader,
  renderRow,
  emptyMessage = "No items yet.",
  draggable = true,
  colSpan,
}: {
  items: T[]
  onReorder: (order: number[]) => void
  renderHeader: () => ReactNode
  renderRow: (item: T) => ReactNode
  emptyMessage?: string
  draggable?: boolean
  colSpan: number
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(items, oldIndex, newIndex).map((item) => item.id))
  }

  const rows = items.map((item) =>
    draggable ? (
      <SortableRow key={item.id} id={item.id}>
        {renderRow(item)}
      </SortableRow>
    ) : (
      <TableRow key={item.id}>{renderRow(item)}</TableRow>
    ),
  )

  const body = (
    <TableBody>
      {rows}
      {items.length === 0 && (
        <TableRow>
          <TableCell colSpan={colSpan + (draggable ? 1 : 0)} className="py-8 text-center text-muted-foreground">
            {emptyMessage}
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  )

  const table = (
    <Table>
      <TableHeader>
        <TableRow>
          {draggable && <TableHead className="w-8" />}
          {renderHeader()}
        </TableRow>
      </TableHeader>
      {draggable ? (
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          {body}
        </SortableContext>
      ) : (
        body
      )}
    </Table>
  )

  if (!draggable) return table

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      {table}
    </DndContext>
  )
}
