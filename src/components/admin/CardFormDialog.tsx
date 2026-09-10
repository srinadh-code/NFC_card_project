import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CustomerPicker } from "@/components/admin/CustomerPicker"
import { PLAN_ACCENT, PLAN_BY_CARD_TYPE } from "@/components/admin/PlanTypeBadge"
import { cn } from "@/lib/utils"
import type { NfcCard, CardType, CardStatus } from "@/types"

// The 3 NEXORA-plan-mapped Card Type values — the only ones offered here.
// "Wooden" has no NEXORA plan and isn't presented as a choice (the backend
// enum itself still allows it; this only changes what this form offers).
// Label/description come straight from NEXORA_CARD_TYPES (via
// PLAN_BY_CARD_TYPE) — the same data the public /shop page reads — rather
// than a second, separately-worded copy.
const CARD_TYPE_ORDER: CardType[] = ["Classic", "Premium", "Custom"]

export interface CardFormValues {
  uid: string
  serialNumber: string
  cardType: CardType
  color: string
  customerEmail: string // "" = unassigned
  status: CardStatus
  purchaseDate: string
  notes: string
}

function emptyValues(): CardFormValues {
  return {
    uid: "",
    serialNumber: "",
    cardType: "Classic",
    color: "Black",
    customerEmail: "",
    status: "Unassigned",
    purchaseDate: new Date().toISOString().slice(0, 10),
    notes: "",
  }
}

const CARD_STATUSES: CardStatus[] = ["Unassigned", "Assigned", "Inactive", "Active", "Blocked", "Lost"]
const COLORS = ["Black", "Blue", "Red", "White", "Green", "Silver", "Gold", "Natural"]

export function CardFormDialog({
  open,
  onOpenChange,
  card,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  card?: NfcCard | null
  onSubmit: (values: CardFormValues) => void
}) {
  const [values, setValues] = useState<CardFormValues>(emptyValues())
  const [dragOverTarget, setDragOverTarget] = useState(false)

  useEffect(() => {
    if (open) {
      setValues(
        card
          ? {
              uid: card.uid,
              serialNumber: card.serialNumber,
              cardType: card.cardType,
              color: card.color,
              customerEmail: card.customerEmail ?? "",
              status: card.status,
              purchaseDate: card.purchaseDate.slice(0, 10),
              notes: card.notes ?? "",
            }
          : emptyValues(),
      )
    }
  }, [open, card])

  function set<K extends keyof CardFormValues>(key: K, value: CardFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{card ? "Edit NFC Card" : "Add NFC Card"}</DialogTitle>
          <DialogDescription>
            {card ? "Update this card's details." : "Register a new NFC card in inventory."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto px-1 py-1 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nf-uid">Card UID</Label>
            <Input
              id="nf-uid"
              placeholder="Leave blank to auto-generate"
              value={values.uid}
              onChange={(e) => set("uid", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nf-serial">Serial Number</Label>
            <Input
              id="nf-serial"
              placeholder="Leave blank to auto-generate"
              value={values.serialNumber}
              onChange={(e) => set("serialNumber", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Card Type</Label>
            <p className="text-xs text-muted-foreground">
              Drag a plan onto the box below to select it — or just click one.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {CARD_TYPE_ORDER.map((cardType) => {
                const plan = PLAN_BY_CARD_TYPE[cardType]
                const selected = values.cardType === cardType
                const accent = plan ? PLAN_ACCENT[plan.id] : undefined
                return (
                  <button
                    key={cardType}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", cardType)
                      e.dataTransfer.effectAllowed = "move"
                    }}
                    onClick={() => set("cardType", cardType)}
                    className={cn(
                      "flex cursor-grab flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-colors active:cursor-grabbing",
                      selected ? "border-transparent" : "border-[#E2E8F0] hover:bg-accent/50",
                    )}
                    style={selected ? { boxShadow: `0 0 0 2px ${accent ?? "#94A3B8"}` } : undefined}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: accent ?? "#94A3B8" }}
                      />
                      {plan ? plan.name.replace("NEXORA ", "") : cardType}
                    </span>
                    <span className="text-[11px] leading-tight text-muted-foreground">
                      {plan ? plan.bestFor : cardType}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Drop target — dragging one of the chips above onto this box
                selects it, same as clicking the chip directly. Always shows
                whatever is currently selected (never truly empty, since
                cardType always has a value). */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverTarget(true)
              }}
              onDragLeave={() => setDragOverTarget(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOverTarget(false)
                const dropped = e.dataTransfer.getData("text/plain") as CardType
                if (CARD_TYPE_ORDER.includes(dropped)) set("cardType", dropped)
              }}
              className={cn(
                "mt-1 flex items-center gap-2 rounded-xl border-2 border-dashed p-2.5 text-sm transition-colors",
                dragOverTarget ? "border-[#4F46E5] bg-[#4F46E5]/5" : "border-[#CBD5E1]",
              )}
            >
              {(() => {
                const plan = PLAN_BY_CARD_TYPE[values.cardType]
                const accent = plan ? PLAN_ACCENT[plan.id] : undefined
                return (
                  <>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: accent ?? "#94A3B8" }} />
                    <span className="font-semibold text-foreground">
                      {plan ? plan.name.replace("NEXORA ", "") : values.cardType}
                    </span>
                    <span className="text-xs text-muted-foreground">selected</span>
                  </>
                )
              })()}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nf-color">Color</Label>
            <Select value={values.color} onValueChange={(v) => set("color", v)}>
              <SelectTrigger id="nf-color" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLORS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="nf-customer">Assign to Customer</Label>
              {values.customerEmail && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => set("customerEmail", "")}
                >
                  Clear
                </button>
              )}
            </div>
            <CustomerPicker
              value={values.customerEmail}
              onChange={(email) => set("customerEmail", email)}
              placeholder="Unassigned"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nf-status">Status</Label>
            <Select value={values.status} onValueChange={(v) => set("status", v as CardStatus)}>
              <SelectTrigger id="nf-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nf-purchase">Purchase Date</Label>
            <Input
              id="nf-purchase"
              type="date"
              value={values.purchaseDate}
              onChange={(e) => set("purchaseDate", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="nf-notes">Notes</Label>
            <Textarea id="nf-notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(values)}>{card ? "Save Changes" : "Add Card"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
