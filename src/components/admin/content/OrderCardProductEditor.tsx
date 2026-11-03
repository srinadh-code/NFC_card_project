import { useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, Eye, ImagePlus, Loader2, Plus, RefreshCw, Star, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ImageUploadField } from "@/components/admin/content/ImageUploadField"
import { IconPickerInput } from "@/components/admin/content/IconPickerInput"
import { ProductDetails } from "@/components/shop/ProductDetails"
import { ApiError } from "@/lib/api"
import { orderCardProductsApi } from "@/lib/contentApi"
import { cloudinaryUrl, MAX_CARD_QTY } from "@/lib/order-card-pricing"
import { cn } from "@/lib/utils"
import type {
  OrderCardProduct,
  OrderCardProductFeature,
  OrderCardProductImage,
  OrderCardProductOffer,
  OrderCardProductTimelineStage,
  OrderCardTone,
} from "@/types/content"

export const ORDER_CARD_PRODUCTS_KEY = ["content", "order-card", "products"] as const

const CARD_TYPE_OPTIONS: { value: OrderCardProduct["card_type"]; label: string }[] = [
  { value: "CUSTOM", label: "Custom NFC Card" },
  { value: "WOODEN", label: "Wooden" },
  { value: "REVIEW", label: "Google Review Card" },
]

const CARD_TONE_OPTIONS: { value: string; label: string }[] = [
  { value: "custom", label: "Custom (multi-hue)" },
  { value: "front", label: "Front (brand gradient)" },
  { value: "back", label: "Back" },
  { value: "gold", label: "Gold" },
]

export const DEFAULT_TIMELINE: OrderCardProductTimelineStage[] = [
  { title: "Order Placed", estimate: "Day 0", description: "We receive your order and payment.", icon: "ShoppingBag", is_active: true },
  { title: "Design Confirmation", estimate: "Within 1-2 Days", description: "We share your card design for approval.", icon: "CheckCircle2", is_active: true },
  { title: "Order Shipped", estimate: "Within 3-4 Days", description: "Your card is printed, programmed and shipped.", icon: "PackageCheck", is_active: true },
  { title: "Expected Delivery", estimate: "Within 5-7 Days", description: "Your card arrives at your doorstep.", icon: "MapPin", is_active: true },
]

type SetField = <K extends keyof OrderCardProduct>(key: K, value: OrderCardProduct[K]) => void

function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function Field({ label, htmlFor, hint, className, children }: { label: string; htmlFor?: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ToggleRow({ title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function RowActions({ onUp, onDown, onRemove, upDisabled, downDisabled }: { onUp?: () => void; onDown?: () => void; onRemove: () => void; upDisabled?: boolean; downDisabled?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {onUp && (
        <Button type="button" size="icon" variant="ghost" onClick={onUp} disabled={upDisabled} aria-label="Move up">
          <ArrowUp className="size-4" />
        </Button>
      )}
      {onDown && (
        <Button type="button" size="icon" variant="ghost" onClick={onDown} disabled={downDisabled} aria-label="Move down">
          <ArrowDown className="size-4" />
        </Button>
      )}
      <Button type="button" size="icon" variant="ghost" onClick={onRemove} aria-label="Remove" className="text-destructive hover:text-destructive">
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

/** Fills in collections a brand-new (unsaved) product doesn't have yet, so
 * the public details screen can render it as a preview. */
function asPreviewProduct(values: Partial<OrderCardProduct>): OrderCardProduct {
  return {
    id: values.id ?? 0,
    product_id: values.product_id ?? "",
    slug: values.slug || "preview",
    name: values.name || "Untitled card",
    short_description: values.short_description ?? "",
    full_description: values.full_description ?? "",
    price: values.price || "0",
    discounted_price: null,
    discount_amount: null,
    offer_title: null,
    design: values.design ?? "",
    best_for: values.best_for ?? "",
    template_count: values.template_count ?? null,
    features: "",
    feature_items: values.feature_items ?? [],
    offers: values.offers ?? [],
    timeline_stages: values.timeline_stages ?? [],
    images: values.images ?? [],
    card_type: values.card_type ?? "CUSTOM",
    card_tone: values.card_tone ?? "",
    image_url: values.image_url ?? "",
    image_caption: values.image_caption ?? "",
    color_name: values.color_name ?? "",
    color_hex: values.color_hex ?? "",
    theme_plan_copy: values.theme_plan_copy ?? "",
    customisation_heading: values.customisation_heading ?? "",
    customisation_description: values.customisation_description ?? "",
    customisation_instructions: values.customisation_instructions ?? "",
    customisation_notes: values.customisation_notes ?? "",
    customisation_image_url: values.customisation_image_url ?? "",
    popular: values.popular ?? false,
    display_order: values.display_order ?? 0,
    is_active: values.is_active ?? true,
    is_published: values.is_published ?? true,
  }
}

/** The product form inside Website Content → Order Card → Products. */
export function OrderCardProductEditor({ values, setField }: { values: Partial<OrderCardProduct>; setField: SetField }) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const offers = values.offers ?? []
  const singleOffer = offers.find((o) => o.min_quantity === 1 && o.is_active)

  function setPrice(price: string) {
    setField("price", price)
    // The single-card offer and the product price are the same number.
    if (singleOffer) setField("offers", offers.map((o) => (o === singleOffer ? { ...o, unit_price: price } : o)))
  }

  return (
    <div className="flex flex-col gap-4 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {values.is_published === false
            ? "Unpublished — not visible on the website."
            : values.is_active === false
              ? "Inactive — not visible on the website."
              : "Published — visible on the Order Card page once saved."}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
          <Eye className="size-4" /> Preview
        </Button>
      </div>

      <Tabs defaultValue="basic">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="customisation">Customisation</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="grid grid-cols-1 gap-4 pt-3 sm:grid-cols-2">
          <Field label="Product name" htmlFor="oc-name">
            <Input id="oc-name" value={values.name ?? ""} onChange={(e) => setField("name", e.target.value)} />
          </Field>
          <Field
            label="Slug"
            htmlFor="oc-slug"
            hint="Stable identifier used in cart/order lines and for profile-template entitlement. Avoid changing it after launch."
          >
            <Input
              id="oc-slug"
              placeholder="custom"
              maxLength={29}
              value={values.slug ?? ""}
              onChange={(e) => setField("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            />
          </Field>
          <Field label="Category / type" hint="What gets sent as the order line's card type at checkout.">
            <Select value={values.card_type ?? "CUSTOM"} onValueChange={(v) => setField("card_type", v as OrderCardProduct["card_type"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARD_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Starting price (single card)"
            htmlFor="oc-price"
            hint={singleOffer ? "Same as the Buy 1 offer on the Pricing tab." : undefined}
          >
            <Input id="oc-price" type="number" min="0.01" step="0.01" value={values.price ?? ""} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Short description" htmlFor="oc-short" className="sm:col-span-2">
            <Textarea id="oc-short" rows={2} value={values.short_description ?? ""} onChange={(e) => setField("short_description", e.target.value)} />
          </Field>
          <Field label="Full description (optional)" htmlFor="oc-full" className="sm:col-span-2">
            <Textarea id="oc-full" rows={3} value={values.full_description ?? ""} onChange={(e) => setField("full_description", e.target.value)} />
          </Field>
          <div className="flex flex-col gap-3 sm:col-span-2">
            <ToggleRow
              title="Published"
              hint="Unpublished products stay hidden from customers while you prepare them."
              checked={values.is_published ?? true}
              onChange={(v) => setField("is_published", v)}
            />
            <ToggleRow
              title='"Most Popular" badge'
              hint="Highlights this card on the product selection screen."
              checked={values.popular ?? false}
              onChange={(v) => setField("popular", v)}
            />
          </div>
          <Field label="Mockup tone (when no image is uploaded)">
            <Select value={values.card_tone || "custom"} onValueChange={(v) => setField("card_tone", v as OrderCardTone)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARD_TONE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Template count (blank = no profile templates)" htmlFor="oc-templates">
            <Input
              id="oc-templates"
              type="number"
              min={0}
              value={values.template_count ?? ""}
              onChange={(e) => setField("template_count", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <Field label="Colour name (cart line)" htmlFor="oc-color-name">
            <Input id="oc-color-name" value={values.color_name ?? ""} onChange={(e) => setField("color_name", e.target.value)} />
          </Field>
          <Field label="Colour (hex)" htmlFor="oc-color-hex">
            <Input id="oc-color-hex" placeholder="#7C3AED" value={values.color_hex ?? ""} onChange={(e) => setField("color_hex", e.target.value)} />
          </Field>
          <Field label="Theme plan copy (shown with profile templates)" htmlFor="oc-theme-copy" className="sm:col-span-2">
            <Textarea id="oc-theme-copy" value={values.theme_plan_copy ?? ""} onChange={(e) => setField("theme_plan_copy", e.target.value)} />
          </Field>
        </TabsContent>

        <TabsContent value="images" className="pt-3">
          {values.id ? (
            <GalleryManager productId={values.id} images={values.images ?? []} onChange={(p) => setField("images", p.images)} />
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Save the product first, then edit it to upload images.
            </p>
          )}
        </TabsContent>

        <TabsContent value="features" className="pt-3">
          <FeaturesEditor items={values.feature_items ?? []} onChange={(items) => setField("feature_items", items)} />
        </TabsContent>

        <TabsContent value="pricing" className="pt-3">
          <OffersEditor
            offers={offers}
            onChange={(next) => {
              setField("offers", next)
              const single = next.find((o) => o.min_quantity === 1 && o.is_active)
              if (single) setField("price", single.unit_price)
            }}
          />
        </TabsContent>

        <TabsContent value="customisation" className="grid grid-cols-1 gap-4 pt-3">
          <Field label="Section heading" htmlFor="oc-cust-heading">
            <Input
              id="oc-cust-heading"
              placeholder="How do I customise/design my card?"
              value={values.customisation_heading ?? ""}
              onChange={(e) => setField("customisation_heading", e.target.value)}
            />
          </Field>
          <Field label="Description" htmlFor="oc-cust-desc">
            <Textarea id="oc-cust-desc" rows={3} value={values.customisation_description ?? ""} onChange={(e) => setField("customisation_description", e.target.value)} />
          </Field>
          <Field label="Instructions (one step per line)" htmlFor="oc-cust-steps">
            <Textarea id="oc-cust-steps" rows={4} value={values.customisation_instructions ?? ""} onChange={(e) => setField("customisation_instructions", e.target.value)} />
          </Field>
          <Field label="Additional notes" htmlFor="oc-cust-notes">
            <Textarea id="oc-cust-notes" rows={2} value={values.customisation_notes ?? ""} onChange={(e) => setField("customisation_notes", e.target.value)} />
          </Field>
          <Field label="Supporting image (optional)">
            {values.id ? (
              <CustomisationImage productId={values.id} url={values.customisation_image_url ?? ""} onChange={(p) => setField("customisation_image_url", p.customisation_image_url)} />
            ) : (
              <p className="text-xs text-muted-foreground">Save the product first to upload an image.</p>
            )}
          </Field>
        </TabsContent>

        <TabsContent value="timeline" className="pt-3">
          <TimelineEditor stages={values.timeline_stages ?? []} onChange={(stages) => setField("timeline_stages", stages)} />
        </TabsContent>
      </Tabs>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Preview — {values.name || "Untitled card"}</DialogTitle>
          </DialogHeader>
          <ProductDetails product={asPreviewProduct(values)} preview />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FeaturesEditor({ items, onChange }: { items: OrderCardProductFeature[]; onChange: (items: OrderCardProductFeature[]) => void }) {
  const update = (i: number, patch: Partial<OrderCardProductFeature>) => onChange(items.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Benefits listed beside the product. Hidden features stay saved but aren&apos;t shown.</p>
      {items.map((feature, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
          <Input aria-label="Feature" placeholder="e.g. NFC Enabled" value={feature.label} onChange={(e) => update(i, { label: e.target.value })} className="sm:flex-1" />
          <div className="sm:w-56">
            <IconPickerInput value={feature.icon} onChange={(icon) => update(i, { icon })} placeholder="Icon (optional)" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={feature.is_active} onCheckedChange={(v) => update(i, { is_active: v })} /> Visible
            </label>
            <RowActions
              onUp={() => onChange(moveItem(items, i, -1))}
              onDown={() => onChange(moveItem(items, i, 1))}
              upDisabled={i === 0}
              downDisabled={i === items.length - 1}
              onRemove={() => onChange(items.filter((_, j) => j !== i))}
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" className="self-start" onClick={() => onChange([...items, { label: "", icon: "", is_active: true }])}>
        <Plus className="size-4" /> Add feature
      </Button>
    </div>
  )
}

function OffersEditor({ offers, onChange }: { offers: OrderCardProductOffer[]; onChange: (offers: OrderCardProductOffer[]) => void }) {
  const sorted = [...offers].sort((a, b) => a.min_quantity - b.min_quantity)
  const single = Number(sorted.find((o) => o.min_quantity === 1)?.unit_price ?? 0)
  const update = (offer: OrderCardProductOffer, patch: Partial<OrderCardProductOffer>) =>
    onChange(offers.map((o) => (o === offer ? { ...o, ...patch } : o)))
  const nextQty = Math.min(MAX_CARD_QTY, Math.max(0, ...offers.map((o) => o.min_quantity)) + 1)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        The per-card price for an order of at least that many cards. A visible quantity-1 offer is the single-card price;
        bulk offers can&apos;t cost more per card than smaller ones. The backend charges exactly these prices.
      </p>
      <div className="hidden grid-cols-[1fr_90px_120px_1fr_auto] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
        <span>Label</span>
        <span>Min. qty</span>
        <span>Price / card</span>
        <span>Savings text (optional)</span>
        <span className="w-24 text-right">Visible</span>
      </div>
      {sorted.map((offer, i) => {
        const saving = single && Number(offer.unit_price) ? (single - Number(offer.unit_price)) * offer.min_quantity : 0
        return (
          <div key={offer.id ?? `new-${i}`} className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_90px_120px_1fr_auto] sm:items-center sm:border-0 sm:p-1">
            <Input aria-label="Offer label" placeholder="Buy 3" value={offer.label} onChange={(e) => update(offer, { label: e.target.value })} />
            <Input
              aria-label="Minimum quantity"
              type="number"
              min={1}
              max={MAX_CARD_QTY}
              value={offer.min_quantity}
              onChange={(e) => update(offer, { min_quantity: Math.max(1, Number(e.target.value) || 1) })}
            />
            <Input aria-label="Price per card" type="number" min="0.01" step="0.01" value={offer.unit_price} onChange={(e) => update(offer, { unit_price: e.target.value })} />
            <Input
              aria-label="Savings text"
              placeholder={saving > 0 ? `Auto: Save ₹${saving.toFixed(0)}` : "Auto"}
              value={offer.savings_text}
              onChange={(e) => update(offer, { savings_text: e.target.value })}
            />
            <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
              <Switch checked={offer.is_active} onCheckedChange={(v) => update(offer, { is_active: v })} aria-label="Visible" />
              <RowActions onRemove={() => onChange(offers.filter((o) => o !== offer))} />
            </div>
          </div>
        )
      })}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => onChange([...offers, { label: `Buy ${nextQty}`, min_quantity: nextQty, unit_price: String(single || ""), savings_text: "", is_active: true }])}
      >
        <Plus className="size-4" /> Add offer
      </Button>
    </div>
  )
}

function TimelineEditor({ stages, onChange }: { stages: OrderCardProductTimelineStage[]; onChange: (stages: OrderCardProductTimelineStage[]) => void }) {
  const update = (i: number, patch: Partial<OrderCardProductTimelineStage>) => onChange(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  return (
    <div className="flex flex-col gap-3">
      {stages.map((stage, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-2">
          <Input aria-label="Stage title" placeholder="Order Shipped" value={stage.title} onChange={(e) => update(i, { title: e.target.value })} />
          <Input aria-label="Estimated days" placeholder="Within 3-4 Days" value={stage.estimate} onChange={(e) => update(i, { estimate: e.target.value })} />
          <Input aria-label="Stage description" placeholder="Description (optional)" value={stage.description} onChange={(e) => update(i, { description: e.target.value })} className="sm:col-span-2" />
          <IconPickerInput value={stage.icon} onChange={(icon) => update(i, { icon })} placeholder="Icon (optional)" />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={stage.is_active} onCheckedChange={(v) => update(i, { is_active: v })} /> Visible
            </label>
            <RowActions
              onUp={() => onChange(moveItem(stages, i, -1))}
              onDown={() => onChange(moveItem(stages, i, 1))}
              upDisabled={i === 0}
              downDisabled={i === stages.length - 1}
              onRemove={() => onChange(stages.filter((_, j) => j !== i))}
            />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => onChange([...stages, { title: "", estimate: "", description: "", icon: "", is_active: true }])}>
          <Plus className="size-4" /> Add stage
        </Button>
        {stages.length === 0 && (
          <Button type="button" variant="ghost" onClick={() => onChange(DEFAULT_TIMELINE)}>
            Use the standard 4 stages
          </Button>
        )}
      </div>
    </div>
  )
}

/** Gallery images are saved immediately (Cloudinary upload), independent of
 * the form's Save button — each call returns the updated product. */
function GalleryManager({ productId, images, onChange }: { productId: number; images: OrderCardProductImage[]; onChange: (product: OrderCardProduct) => void }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const addRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const replaceTarget = useRef<number | null>(null)
  const ordered = [...images].sort((a, b) => a.display_order - b.display_order || a.id - b.id)

  async function run(label: string, action: () => Promise<OrderCardProduct>, success: string) {
    setBusy(label)
    try {
      const product = await action()
      onChange(product)
      queryClient.invalidateQueries({ queryKey: ORDER_CARD_PRODUCTS_KEY })
      queryClient.invalidateQueries({ queryKey: ["content", "public-order-card"] })
      toast.success(success)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Image update failed. Please try again.")
    } finally {
      setBusy(null)
    }
  }

  async function handleAdd(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    // Only the very first image of an empty gallery becomes the main one.
    const galleryWasEmpty = images.length === 0
    for (const [index, file] of files.entries()) {
      await run(
        "add",
        () => orderCardProductsApi.addImage(productId, file, { isPrimary: galleryWasEmpty && index === 0 }),
        `${file.name} uploaded.`,
      )
    }
  }

  function handleReplace(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    const imageId = replaceTarget.current
    if (file && imageId) run(`replace-${imageId}`, () => orderCardProductsApi.replaceImage(productId, imageId, file), "Image replaced.")
  }

  function move(index: number, delta: number) {
    const next = moveItem(ordered, index, delta)
    run("reorder", () => orderCardProductsApi.reorderImages(productId, next.map((img) => img.id)), "Image order updated.")
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        JPEG, PNG or WEBP, up to 5MB each, stored on Cloudinary. The star marks the main image shown on the product card.
        Changes here save immediately.
      </p>
      <input ref={addRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleAdd} />
      <input ref={replaceRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleReplace} />
      {ordered.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No images yet.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ordered.map((img, i) => (
          <div key={img.id} className={cn("overflow-hidden rounded-xl border", img.is_primary && "ring-2 ring-primary")}>
            <div className="relative aspect-[4/3] bg-secondary">
              <img src={cloudinaryUrl(img.image_url, 400)} alt={img.alt_text} loading="lazy" className="h-full w-full object-cover" />
              {busy === `replace-${img.id}` && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-1 p-1.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={img.is_primary ? "Main image" : "Set as main image"}
                disabled={img.is_primary || busy !== null}
                onClick={() => run("primary", () => orderCardProductsApi.updateImage(productId, img.id, { is_primary: true }), "Main image updated.")}
              >
                <Star className={cn("size-4", img.is_primary && "fill-primary text-primary")} />
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label="Move left" disabled={i === 0 || busy !== null} onClick={() => move(i, -1)}>
                <ArrowUp className="size-4 -rotate-90" />
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label="Move right" disabled={i === ordered.length - 1 || busy !== null} onClick={() => move(i, 1)}>
                <ArrowDown className="size-4 -rotate-90" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Replace image"
                disabled={busy !== null}
                onClick={() => {
                  replaceTarget.current = img.id
                  replaceRef.current?.click()
                }}
              >
                <RefreshCw className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Remove image"
                className="text-destructive hover:text-destructive"
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm("Remove this image? It will also be deleted from Cloudinary.")) {
                    run("remove", () => orderCardProductsApi.removeImage(productId, img.id), "Image removed.")
                  }
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" className="self-start" disabled={busy !== null || images.length >= 12} onClick={() => addRef.current?.click()}>
        {busy === "add" ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        Upload images
      </Button>
    </div>
  )
}

function CustomisationImage({ productId, url, onChange }: { productId: number; url: string; onChange: (product: OrderCardProduct) => void }) {
  const queryClient = useQueryClient()
  const refresh = (product: OrderCardProduct) => {
    onChange(product)
    queryClient.invalidateQueries({ queryKey: ORDER_CARD_PRODUCTS_KEY })
  }
  return (
    <ImageUploadField
      currentUrl={url}
      accept="image/jpeg,image/png,image/webp"
      formatsHelp="JPEG, PNG or WEBP. Max 5MB."
      onUpload={async (file) => refresh(await orderCardProductsApi.uploadCustomisationImage(productId, file))}
      onRemove={async () => refresh(await orderCardProductsApi.removeCustomisationImage(productId))}
    />
  )
}
