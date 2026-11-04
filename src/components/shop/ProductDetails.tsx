import { useState, type CSSProperties, type ReactNode } from "react"
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Minus, Palette, Plus, ShoppingCart, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProductImage } from "@/components/shop/ProductImage"
import { cardClass, gradientClass } from "@/components/marketing/PremiumCard"
import { resolveIcon } from "@/lib/icon-map"
import { formatCurrency } from "@/lib/mock-api"
import {
  activeOffers,
  clampQty,
  cloudinaryUrl,
  galleryOf,
  MAX_CARD_QTY,
  offerForQuantity,
  savingPerCard,
  unitPriceFor,
} from "@/lib/order-card-pricing"
import { cn } from "@/lib/utils"
import type { OrderCardProduct } from "@/types/content"

// Static panels on this screen — the site's card look without the hover lift.
const panelClass = cn(cardClass, "hover:translate-y-0 hover:shadow-[0_10px_30px_rgba(15,23,42,0.06)]")

interface ProductDetailsProps {
  product: OrderCardProduct
  currency?: string
  onBack?: () => void
  backLabel?: string
  onAddToCart?: (qty: number) => void
  onBuyNow?: (qty: number) => void
  /** Which action is in flight, so its button shows a spinner. */
  pendingAction?: "cart" | "buy" | null
  /** Admin preview: everything renders, nothing can be bought. */
  preview?: boolean
  /** Extra content under the purchase buttons (e.g. a templates link). */
  extra?: ReactNode
}

/** One product's details screen on the Order Card page — gallery, pricing
 * offers, quantity, Add to Cart / Buy Now, features, customisation info and
 * the delivery timeline. Everything comes from the product's CMS data. */
export function ProductDetails({
  product,
  currency = "INR",
  onBack,
  backLabel = "Order Card",
  onAddToCart,
  onBuyNow,
  pendingAction = null,
  preview = false,
  extra,
}: ProductDetailsProps) {
  const [qty, setQty] = useState(1)
  const offers = activeOffers(product)
  const selectedOffer = offerForQuantity(product, qty)
  const unitPrice = unitPriceFor(product, qty)
  const total = unitPrice * qty
  const saving = savingPerCard(product, qty) * qty
  const features = product.feature_items.filter((f) => f.is_active)
  const stages = product.timeline_stages.filter((s) => s.is_active)
  const instructions = product.customisation_instructions
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const hasCustomisation = Boolean(
    product.customisation_heading || product.customisation_description || instructions.length || product.customisation_notes,
  )
  const busy = pendingAction !== null
  const money = (amount: number) => formatCurrency(amount, currency)

  return (
    <div className="space-y-6">
      {onBack && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ChevronLeft className="size-4" />
            {backLabel}
          </button>
          <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold text-foreground">{product.name}</span>
        </nav>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Gallery product={product} />
        </div>

        <div className="space-y-5 lg:col-span-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{product.name}</h2>
              {product.popular && (
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Most Popular</span>
              )}
            </div>
            {product.short_description && <p className="mt-2 text-muted-foreground">{product.short_description}</p>}
            <div className="mt-3 flex flex-wrap items-baseline gap-2">
              <p className={cn("bg-gradient-to-r bg-clip-text text-3xl font-bold text-transparent", gradientClass)}>
                {money(unitPrice)}
              </p>
              <span className="text-sm text-muted-foreground">/ card</span>
              {unitPrice < unitPriceFor(product, 1) && (
                <span className="text-base text-muted-foreground line-through">{money(unitPriceFor(product, 1))}</span>
              )}
            </div>
            {product.offer_title && (
              <p className="mt-1 text-xs font-medium text-success">Extra offer: {product.offer_title} — applied in your cart.</p>
            )}
          </div>

          {offers.length > 1 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">Select Offer</p>
              <div className="grid grid-cols-3 gap-2">
                {offers.map((offer) => {
                  const active = selectedOffer?.min_quantity === offer.min_quantity
                  const offerSaving = (Number(product.price) - Number(offer.unit_price)) * offer.min_quantity
                  return (
                    <button
                      key={offer.min_quantity}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setQty(offer.min_quantity)}
                      className={cn(
                        "rounded-xl border px-2 py-2.5 text-center transition-all hover:border-primary/60",
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                          : "border-border bg-card",
                      )}
                    >
                      <span className={cn("block text-sm font-bold", active ? "text-primary" : "text-foreground")}>
                        {offer.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {money(Number(offer.unit_price))} / Card
                      </span>
                      {(offer.savings_text || offerSaving > 0) && (
                        <span className="mt-0.5 block text-[11px] font-semibold text-success">
                          {offer.savings_text || `Save ${money(offerSaving)}`}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label htmlFor={`qty-${product.slug}`} className="mb-2 block text-sm font-semibold text-foreground">
              Quantity
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQty((q) => clampQty(q - 1))}
                disabled={qty <= 1}
                aria-label="Decrease quantity"
              >
                <Minus className="size-4" />
              </Button>
              <Input
                id={`qty-${product.slug}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_CARD_QTY}
                value={qty}
                onChange={(e) => setQty(clampQty(Number(e.target.value)))}
                className="w-16 text-center text-base font-semibold"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQty((q) => clampQty(q + 1))}
                disabled={qty >= MAX_CARD_QTY}
                aria-label="Increase quantity"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-secondary/60 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {qty} × {money(unitPrice)}
                {selectedOffer && selectedOffer.min_quantity > 1 ? ` (${selectedOffer.label})` : ""}
              </span>
              <span className="text-lg font-bold text-foreground">{money(total)}</span>
            </div>
            {saving > 0 && <p className="mt-1 text-right text-xs font-semibold text-success">You save {money(saving)}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              size="lg"
              variant="outline"
              className="border-primary text-primary hover:bg-primary/5"
              disabled={preview || busy}
              onClick={() => onAddToCart?.(qty)}
            >
              {pendingAction === "cart" ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />}
              Add To Cart
            </Button>
            <Button
              size="lg"
              className="rounded-xl bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#EC4899] text-white shadow-[0_10px_30px_rgba(79,70,229,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_15px_35px_rgba(79,70,229,0.45)]"
              disabled={preview || busy}
              onClick={() => onBuyNow?.(qty)}
            >
              {pendingAction === "buy" ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
              Buy Now
            </Button>
          </div>
          {preview && <p className="text-xs text-muted-foreground">Preview — buttons are disabled.</p>}
          {extra}
        </div>

        {features.length > 0 && (
          <aside className={cn(panelClass, "h-fit p-5 lg:col-span-3")} aria-label="Features">
            <ul className="space-y-3.5">
              {features.map((feature, i) => {
                const Icon = feature.icon ? resolveIcon(feature.icon) : CheckCircle2
                return (
                  <li key={feature.id ?? i} className="flex items-start gap-3 text-sm font-medium text-foreground">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span className="pt-1">{feature.label}</span>
                  </li>
                )
              })}
            </ul>
          </aside>
        )}
      </div>

      {product.full_description && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{product.full_description}</p>
      )}

      {(hasCustomisation || stages.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {hasCustomisation && (
            <section className={cn(panelClass, "p-5 sm:p-6", stages.length > 0 ? "lg:col-span-2" : "lg:col-span-5")}>
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Palette className="size-5" />
                </span>
                <div className="min-w-0 space-y-2">
                  {product.customisation_heading && (
                    <h3 className="text-base font-bold text-foreground">{product.customisation_heading}</h3>
                  )}
                  {product.customisation_description && (
                    <p className="text-sm leading-relaxed text-muted-foreground">{product.customisation_description}</p>
                  )}
                  {instructions.length > 0 && (
                    <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
                      {instructions.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  )}
                  {product.customisation_notes && (
                    <p className="text-xs text-muted-foreground">{product.customisation_notes}</p>
                  )}
                </div>
              </div>
              {product.customisation_image_url && (
                <img
                  src={cloudinaryUrl(product.customisation_image_url, 600)}
                  alt=""
                  loading="lazy"
                  className="mt-4 max-h-48 w-full rounded-xl object-contain"
                />
              )}
            </section>
          )}

          {stages.length > 0 && (
            <section className={cn(panelClass, "p-5 sm:p-6", hasCustomisation ? "lg:col-span-3" : "lg:col-span-5")}>
              <h3 className="mb-5 text-base font-bold text-foreground">Order &amp; Delivery Timeline</h3>
              {/* Vertical list on phones; one connected row from sm up. */}
              <ol
                className="grid gap-5 sm:[grid-template-columns:var(--timeline-cols)] sm:gap-3"
                style={{ "--timeline-cols": `repeat(${stages.length}, minmax(0, 1fr))` } as CSSProperties}
              >
                {stages.map((stage, i) => {
                  const Icon = stage.icon ? resolveIcon(stage.icon) : CheckCircle2
                  const last = i === stages.length - 1
                  return (
                    <li key={stage.id ?? i} className="relative flex items-start gap-3 sm:flex-col sm:items-center sm:gap-0 sm:text-center">
                      {!last && (
                        <span
                          aria-hidden="true"
                          className="absolute left-5 top-10 h-[calc(100%-1.25rem)] w-0.5 bg-primary/25 sm:left-1/2 sm:top-5 sm:h-0.5 sm:w-full sm:bg-gradient-to-r sm:from-primary/60 sm:to-primary/20"
                        />
                      )}
                      <span
                        className={cn(
                          "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full text-white shadow-md",
                          gradientClass,
                        )}
                      >
                        <Icon className="size-5" />
                      </span>
                      <div className="sm:mt-2">
                        <p className="text-sm font-semibold text-foreground">{stage.title}</p>
                        {stage.estimate && <p className="text-xs font-medium text-primary">{stage.estimate}</p>}
                        {stage.description && <p className="mt-1 text-xs text-muted-foreground">{stage.description}</p>}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function Gallery({ product }: { product: OrderCardProduct }) {
  const images = galleryOf(product)
  const [index, setIndex] = useState(0)
  const current = images[Math.min(index, images.length - 1)]
  const step = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length)

  return (
    <div className="space-y-3">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[24px] border border-border bg-gradient-to-br from-secondary to-accent">
        <ProductImage
          url={current?.image_url}
          alt={current?.alt_text || product.name}
          width={1000}
          tone={product.card_tone}
          className="h-full w-full object-cover"
          mockupClassName="h-44 w-72 -rotate-3 sm:h-52 sm:w-80"
        />
        {images.length > 1 && (
          <>
            <GalleryArrow side="left" onClick={() => step(-1)} />
            <GalleryArrow side="right" onClick={() => step(1)} />
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous image"
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <button
                key={img.id || img.image_url}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  "h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-all",
                  i === index ? "border-primary" : "border-transparent opacity-75 hover:opacity-100",
                )}
              >
                <ProductImage
                  url={img.image_url}
                  alt=""
                  width={200}
                  tone={product.card_tone}
                  loading="lazy"
                  className="h-full w-full object-cover"
                  mockupClassName="h-full w-full scale-75"
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next image"
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      )}
    </div>
  )
}

function GalleryArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous image" : "Next image"}
      className={cn(
        "absolute top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-foreground shadow-md backdrop-blur transition hover:bg-white",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" />
    </button>
  )
}
