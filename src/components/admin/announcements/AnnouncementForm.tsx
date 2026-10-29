import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { orderCardProductsApi } from "@/lib/contentApi"
import type {
  AnnouncementDiscountType,
  AnnouncementDisplayLocation,
  AnnouncementFormPayload,
  AnnouncementType,
  ApiAnnouncement,
} from "@/lib/api"

const TYPE_OPTIONS: { value: AnnouncementType; label: string }[] = [
  { value: "GENERAL", label: "General Announcement" },
  { value: "FESTIVAL", label: "Festival" },
  { value: "OFFER", label: "Offer / Promotion" },
  { value: "PRODUCT", label: "New Product" },
  { value: "IMPORTANT", label: "Important Update" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "FEATURE", label: "Feature Update" },
]

// `datetime-local` inputs work in the browser's local time with no
// timezone suffix; the backend stores/returns real UTC ISO timestamps.
// These two are the only place that conversion happens.
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInputValue(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

interface FormState {
  title: string
  message: string
  announcement_type: AnnouncementType
  showCustomer: boolean
  showPublic: boolean
  start_at: string
  end_at: string
  offer_title: string
  discount_type: AnnouncementDiscountType
  discount_value: string
  promo_code: string
  automatic_apply: boolean
  applies_to_all_products: boolean
  selected_card_types: string[]
  first_order_only: boolean
  cta_text: string
  cta_link: string
}

function initialStateFrom(initial?: ApiAnnouncement): FormState {
  const discountType = initial?.discount_type ?? "PERCENTAGE"
  const discountValue =
    discountType === "PERCENTAGE"
      ? (initial?.discount_percentage != null ? String(initial.discount_percentage) : "")
      : (initial?.discount_amount ?? "")
  return {
    title: initial?.title ?? "",
    message: initial?.message ?? "",
    announcement_type: initial?.announcement_type ?? "GENERAL",
    showCustomer: initial ? initial.display_location !== "PUBLIC" : true,
    showPublic: initial ? initial.display_location !== "CUSTOMER" : false,
    start_at: toLocalInputValue(initial?.start_at),
    end_at: toLocalInputValue(initial?.end_at),
    offer_title: initial?.offer_title ?? "",
    discount_type: discountType,
    discount_value: discountValue,
    promo_code: initial?.promo_code ?? "",
    automatic_apply: initial?.automatic_apply ?? true,
    applies_to_all_products: initial?.applies_to_all_products ?? true,
    selected_card_types: initial?.applicable_card_types
      ? initial.applicable_card_types.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    first_order_only: initial?.first_order_only ?? false,
    cta_text: initial?.cta_text ?? "",
    cta_link: initial?.cta_link ?? "",
  }
}

/**
 * Create/edit form for one Announcement — reused by both the "New
 * Announcement" dialog and "Edit" (see AnnouncementList). Offer fields only
 * render when Announcement Type is Offer / Promotion, and are never
 * required even then (an offer can publish with just a title/message and
 * fill in discount/promo code later).
 *
 * Editing shows a single "Save Changes" button that leaves is_published
 * untouched — Publish/Unpublish is a separate, explicit action in
 * AnnouncementList's row actions, not folded into this form, so an admin
 * editing copy on a live announcement can never accidentally publish or
 * unpublish it.
 */
export function AnnouncementForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: ApiAnnouncement
  onSubmit: (payload: AnnouncementFormPayload) => Promise<void>
  onCancel?: () => void
  submitting?: boolean
}) {
  const [form, setForm] = useState<FormState>(() => initialStateFrom(initial))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const isOffer = form.announcement_type === "OFFER"
  const isEdit = Boolean(initial)

  // The real product catalog (website_content.OrderCardProduct) — never a
  // hardcoded product list. Only fetched when the Offer Details section is
  // actually visible, since that's the only place it's needed.
  const productsQuery = useQuery({
    queryKey: ["admin-order-card-products"],
    queryFn: () => orderCardProductsApi.list(),
    enabled: isOffer,
  })
  const products = productsQuery.data ?? []

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: "" }))
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {}
    if (!form.title.trim()) next.title = "Title is required."
    if (!form.message.trim()) next.message = "Message is required."
    if (!form.showCustomer && !form.showPublic) next.display = "Select at least one display location."
    if (form.start_at && form.end_at && new Date(form.start_at) > new Date(form.end_at)) {
      next.end_at = "End date cannot be before the start date."
    }
    if (isOffer && form.discount_type === "PERCENTAGE" && form.discount_value) {
      const n = Number(form.discount_value)
      if (Number.isNaN(n) || n < 0 || n > 100) next.discount_value = "Must be between 0 and 100."
    }
    if (isOffer && !form.applies_to_all_products && form.selected_card_types.length === 0) {
      next.applicable_products = "Select at least one product, or choose All Products."
    }
    if (form.cta_link && !/^(\/[^\s]*|https?:\/\/[^\s]+)$/.test(form.cta_link)) {
      next.cta_link = "Use an internal path (e.g. /order-card) or a full https:// URL."
    }
    return next
  }

  function buildPayload(publish?: boolean): AnnouncementFormPayload {
    const displayLocation: AnnouncementDisplayLocation =
      form.showCustomer && form.showPublic ? "BOTH" : form.showPublic ? "PUBLIC" : "CUSTOMER"
    return {
      title: form.title.trim(),
      message: form.message.trim(),
      announcement_type: form.announcement_type,
      display_location: displayLocation,
      ...(publish !== undefined ? { is_published: publish } : {}),
      start_at: fromLocalInputValue(form.start_at),
      end_at: fromLocalInputValue(form.end_at),
      offer_title: form.offer_title.trim(),
      discount_type: form.discount_type,
      discount_percentage: form.discount_type === "PERCENTAGE" && form.discount_value ? Number(form.discount_value) : null,
      discount_amount: form.discount_type === "FIXED" && form.discount_value ? form.discount_value : null,
      promo_code: form.promo_code.trim(),
      automatic_apply: form.automatic_apply,
      applies_to_all_products: form.applies_to_all_products,
      applicable_card_types: form.applies_to_all_products ? "" : form.selected_card_types.join(","),
      first_order_only: form.first_order_only,
      cta_text: form.cta_text.trim(),
      cta_link: form.cta_link.trim(),
    }
  }

  async function handleSubmit(publish?: boolean) {
    const validationErrors = validate()
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return
    await onSubmit(buildPayload(publish))
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label>Title</Label>
        <Input
          value={form.title}
          onChange={(e) => setField("title", e.target.value)}
          placeholder="e.g. Diwali Special Offer 🎉"
          aria-invalid={!!errors.title}
        />
        {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Message</Label>
        <Textarea
          value={form.message}
          onChange={(e) => setField("message", e.target.value)}
          placeholder="Get 20% OFF on NEXORA Premium NFC Cards. Limited-time offer."
          rows={3}
          aria-invalid={!!errors.message}
        />
        {errors.message && <p className="text-xs text-destructive">{errors.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Announcement Type</Label>
        <Select value={form.announcement_type} onValueChange={(v) => setField("announcement_type", v as AnnouncementType)}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Display On</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.showCustomer} onCheckedChange={(v) => setField("showCustomer", v === true)} />
            Customer Dashboard
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.showPublic} onCheckedChange={(v) => setField("showPublic", v === true)} />
            Public Website
          </label>
        </div>
        {errors.display && <p className="text-xs text-destructive">{errors.display}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Start Date &amp; Time</Label>
          <Input
            type="datetime-local"
            value={form.start_at}
            onChange={(e) => setField("start_at", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Blank = visible immediately.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>End Date &amp; Time</Label>
          <Input
            type="datetime-local"
            value={form.end_at}
            onChange={(e) => setField("end_at", e.target.value)}
            aria-invalid={!!errors.end_at}
          />
          {errors.end_at ? (
            <p className="text-xs text-destructive">{errors.end_at}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Blank = never expires on its own.</p>
          )}
        </div>
      </div>

      {isOffer && (
        <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
          <p className="text-sm font-semibold text-foreground">Offer Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Offer Title</Label>
              <Input
                value={form.offer_title}
                onChange={(e) => setField("offer_title", e.target.value)}
                placeholder="Diwali Special Offer"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Discount Type</Label>
              <Select
                value={form.discount_type}
                onValueChange={(v) => setField("discount_type", v as AnnouncementDiscountType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                  <SelectItem value="FIXED">Fixed Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Discount Value {form.discount_type === "PERCENTAGE" ? "(%)" : "(₹)"}</Label>
              <Input
                type="number"
                min={0}
                max={form.discount_type === "PERCENTAGE" ? 100 : undefined}
                value={form.discount_value}
                onChange={(e) => setField("discount_value", e.target.value)}
                placeholder={form.discount_type === "PERCENTAGE" ? "20" : "100"}
                aria-invalid={!!errors.discount_value}
              />
              {errors.discount_value && <p className="text-xs text-destructive">{errors.discount_value}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Promo Code (optional)</Label>
              <Input
                value={form.promo_code}
                onChange={(e) => setField("promo_code", e.target.value.toUpperCase())}
                placeholder="DIWALI20"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Automatic Apply</p>
                <p className="text-xs text-muted-foreground">
                  {form.automatic_apply
                    ? "Applies automatically — no code needed."
                    : "Customer must enter the promo code."}
                </p>
              </div>
              <Switch
                checked={form.automatic_apply}
                onCheckedChange={(v) => setField("automatic_apply", v)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">First Order Only</p>
                <p className="text-xs text-muted-foreground">
                  {form.first_order_only
                    ? "Only customers with zero previous orders are eligible."
                    : "Available to all customers."}
                </p>
              </div>
              <Switch
                checked={form.first_order_only}
                onCheckedChange={(v) => setField("first_order_only", v)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>CTA Button Text</Label>
              <Input
                value={form.cta_text}
                onChange={(e) => setField("cta_text", e.target.value)}
                placeholder="Shop Now"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>CTA Link</Label>
              <Input
                value={form.cta_link}
                onChange={(e) => setField("cta_link", e.target.value)}
                placeholder="/order-card"
                aria-invalid={!!errors.cta_link}
              />
              {errors.cta_link && <p className="text-xs text-destructive">{errors.cta_link}</p>}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Applicable Products</Label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.applies_to_all_products}
                onCheckedChange={(v) => setField("applies_to_all_products", v === true)}
              />
              All Products
            </label>
            {!form.applies_to_all_products && (
              <div className="flex flex-col gap-2 pl-6">
                {productsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Loading products…</p>
                ) : (
                  products.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.selected_card_types.includes(p.card_type)}
                        onCheckedChange={(v) =>
                          setField(
                            "selected_card_types",
                            v === true
                              ? [...form.selected_card_types, p.card_type]
                              : form.selected_card_types.filter((c) => c !== p.card_type),
                          )
                        }
                      />
                      {p.name} — ₹{p.price}
                    </label>
                  ))
                )}
              </div>
            )}
            {errors.applicable_products && (
              <p className="text-xs text-destructive">{errors.applicable_products}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {isEdit ? (
          <Button onClick={() => handleSubmit(undefined)} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Save Changes
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => handleSubmit(false)} disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Save Draft
            </Button>
            <Button onClick={() => handleSubmit(true)} disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Publish
            </Button>
          </>
        )}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
