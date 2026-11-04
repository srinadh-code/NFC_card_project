import { ArrowRight, Crown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProductImage } from "@/components/shop/ProductImage"
import { cardClass, gradientClass } from "@/components/marketing/PremiumCard"
import { formatCurrency } from "@/lib/mock-api"
import { galleryOf, unitPriceFor } from "@/lib/order-card-pricing"
import { cn } from "@/lib/utils"
import type { OrderCardProduct } from "@/types/content"

interface ProductSelectionProps {
  products: OrderCardProduct[]
  currency?: string
  onSelect: (slug: string) => void
}

/** The Order Card page's first screen: one card per published product. */
export function ProductSelection({ products, currency = "INR", onSelect }: ProductSelectionProps) {
  return (
    <div className="grid grid-cols-1 justify-center gap-6 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(0,520px))]">
      {products.map((product) => {
        const image = galleryOf(product)[0]
        return (
          <article key={product.slug} className={cn(cardClass, "relative flex flex-col overflow-hidden")}>
            {product.popular && (
              <span
                className={cn(
                  gradientClass,
                  "absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(124,58,237,0.4)]",
                )}
              >
                <Crown className="size-3.5" />
                Most Popular
              </span>
            )}
            <button
              type="button"
              onClick={() => onSelect(product.slug)}
              aria-label={`View ${product.name}`}
              className="flex aspect-[16/10] items-center justify-center overflow-hidden bg-gradient-to-br from-secondary to-accent"
            >
              <ProductImage
                url={image?.image_url}
                alt={image?.alt_text || product.name}
                width={900}
                tone={product.card_tone}
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
              />
            </button>
            <div className="flex flex-1 flex-col p-6">
              <h3 className="text-xl font-bold text-foreground">{product.name}</h3>
              {product.short_description && (
                <p className="mt-2 text-sm text-muted-foreground">{product.short_description}</p>
              )}
              <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                <p className="text-sm text-muted-foreground">
                  From{" "}
                  <span className={cn("bg-gradient-to-r bg-clip-text text-2xl font-bold text-transparent", gradientClass)}>
                    {formatCurrency(unitPriceFor(product, 1), currency)}
                  </span>
                </p>
                <Button
                  onClick={() => onSelect(product.slug)}
                  className={cn(
                    "rounded-xl text-white",
                    product.popular
                      ? "bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#EC4899] shadow-[0_10px_30px_rgba(79,70,229,0.35)]"
                      : "",
                  )}
                >
                  Select Card
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
