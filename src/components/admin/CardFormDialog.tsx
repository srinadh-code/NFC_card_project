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
import type { NfcCard, CardType, CardStatus } from "@/types"

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
    cardType: "Standard",
    color: "Black",
    customerEmail: "",
    status: "Unassigned",
    purchaseDate: new Date().toISOString().slice(0, 10),
    notes: "",
  }
}

const CARD_TYPES: CardType[] = ["Standard", "Premium", "Wooden", "Metal"]
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nf-type">Card Type</Label>
            <Select value={values.cardType} onValueChange={(v) => set("cardType", v as CardType)}>
              <SelectTrigger id="nf-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
