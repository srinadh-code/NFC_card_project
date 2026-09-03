import { CreditCard } from "lucide-react"
import type { Product } from "@/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/mock-api"
import { cn } from "@/lib/utils"

interface ProductCardProps {
  product: Product
  onSelect: (product: Product) => void
  selected?: boolean
}

export default function ProductCard({ product, onSelect, selected }: ProductCardProps) {
  const swatch = product.colors[0]?.hex ?? "#6D5EF0"
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-lg",
        selected && "ring-2 ring-primary",
      )}
    >
      <div
        className="relative flex h-40 items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${swatch}22, ${swatch}55)` }}
      >
        {product.popular && (
          <Badge className="absolute left-3 top-3" variant="default">
            Most Popular
          </Badge>
        )}
        <div
          className="flex h-24 w-40 items-center justify-center rounded-xl shadow-lg"
          style={{ backgroundColor: swatch }}
        >
          <CreditCard className="size-10 text-white/90" />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-semibold text-foreground">{product.name}</h3>
        <p className="mt-1 flex-1 text-sm text-muted-foreground">{product.description}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-lg font-bold text-primary">{formatCurrency(product.price)}</span>
          <Button size="sm" onClick={() => onSelect(product)}>
            Select
          </Button>
        </div>
      </div>
    </div>
  )
}
