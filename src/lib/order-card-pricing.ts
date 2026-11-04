import type { OrderCardProduct, OrderCardProductOffer } from "@/types/content"

/** Largest quantity of one card a cart line accepts (backend: MAX_LINE_QTY). */
export const MAX_CARD_QTY = 100

/** Visible tiers, smallest quantity first. */
export function activeOffers(product: Pick<OrderCardProduct, "offers">): OrderCardProductOffer[] {
  return [...product.offers].filter((o) => o.is_active).sort((a, b) => a.min_quantity - b.min_quantity)
}

/** The tier that prices `qty` cards — the visible tier with the largest
 * min_quantity not above qty. Mirrors OrderCardProduct.offer_for_quantity
 * on the backend, which is what the cart and checkout actually charge. */
export function offerForQuantity(product: Pick<OrderCardProduct, "offers">, qty: number) {
  const applicable = activeOffers(product).filter((o) => o.min_quantity <= qty)
  return applicable.length ? applicable[applicable.length - 1] : null
}

export function unitPriceFor(product: Pick<OrderCardProduct, "offers" | "price">, qty: number): number {
  const offer = offerForQuantity(product, qty)
  return Number(offer ? offer.unit_price : product.price)
}

/** Saving per card against the single-card price (never negative). */
export function savingPerCard(product: Pick<OrderCardProduct, "offers" | "price">, qty: number): number {
  return Math.max(0, unitPriceFor(product, 1) - unitPriceFor(product, qty))
}

export function clampQty(qty: number) {
  if (!Number.isFinite(qty)) return 1
  return Math.min(MAX_CARD_QTY, Math.max(1, Math.round(qty)))
}

/** Resized, auto-format Cloudinary delivery URL; any other URL is returned
 * unchanged. */
export function cloudinaryUrl(url: string, width: number) {
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url
  return url.replace("/upload/", `/upload/f_auto,q_auto,c_limit,w_${width}/`)
}

/** Primary image first, then the rest of the gallery in admin order. */
export function galleryOf(product: Pick<OrderCardProduct, "images" | "image_url">) {
  const images = [...product.images].sort((a, b) => a.display_order - b.display_order || a.id - b.id)
  const primary = images.find((img) => img.is_primary)
  const ordered = primary ? [primary, ...images.filter((img) => img !== primary)] : images
  if (ordered.length === 0 && product.image_url) {
    return [{ id: 0, image_url: product.image_url, alt_text: "", is_primary: true, display_order: 0 }]
  }
  return ordered
}
