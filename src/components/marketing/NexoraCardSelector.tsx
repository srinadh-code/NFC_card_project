import { Check, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { cardClass, gradientClass } from "@/components/marketing/PremiumCard"
import { formatCurrency } from "@/lib/mock-api"
import type { NexoraCardType } from "@/data/constants"

interface NexoraCardSelectorProps {
  cardTypes: NexoraCardType[]
  selectedId: NexoraCardType["id"]
  onSelect: (id: NexoraCardType["id"]) => void
}

export default function NexoraCardSelector({ cardTypes, selectedId, onSelect }: NexoraCardSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {cardTypes.map((card) => {
        const selected = card.id === selectedId
        return (
          <div
            key={card.id}
            onClick={() => onSelect(card.id)}
            className={cn(
              cardClass,
              "relative flex cursor-pointer flex-col p-6 sm:p-7",
              card.popular && "sm:-translate-y-2 sm:hover:-translate-y-3.5",
              selected
                ? "border-transparent ring-2 ring-[#7C3AED] shadow-[0_20px_45px_rgba(124,58,237,0.25)]"
                : card.popular && "border-transparent shadow-[0_15px_40px_rgba(124,58,237,0.18)]",
            )}
            style={
              card.popular
                ? { backgroundImage: "linear-gradient(white,white), linear-gradient(120deg,#4F46E5,#7C3AED,#EC4899)", backgroundOrigin: "border-box", backgroundClip: "padding-box, border-box", border: "1.5px solid transparent" }
                : undefined
            }
          >
            {card.popular && (
              <span
                className={cn(
                  gradientClass,
                  "absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-semibold tracking-wide text-white shadow-[0_8px_20px_rgba(124,58,237,0.4)]",
                )}
              >
                Most Popular
              </span>
            )}

            <h3 className="text-xl font-bold text-foreground">{card.name}</h3>
            <p
              className={cn(
                "mt-2 bg-gradient-to-r bg-clip-text text-3xl font-bold text-transparent",
                gradientClass,
              )}
            >
              {formatCurrency(card.price)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{card.design}</p>

            <div className="mt-5 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Best For</p>
              <p className="text-sm font-medium text-foreground">{card.bestFor}</p>
            </div>

            <div className="mt-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile Templates</p>
              <p className="text-sm font-medium text-foreground">
                {card.templateCount} {card.templateCount === 1 ? "Template" : "Templates"} Included
              </p>
            </div>

            <ul className="mt-5 flex-1 space-y-2.5">
              {card.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#4F46E5]" />
                  {feature}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={(e) => {
                // The card container above also selects on click — stop this
                // click from bubbling up to it so a button press doesn't
                // fire onSelect twice.
                e.stopPropagation()
                onSelect(card.id)
              }}
              className={cn(
                "mt-6 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300",
                selected
                  ? cn(gradientClass, "text-white shadow-[0_10px_30px_rgba(79,70,229,0.35)]")
                  : "border border-[#4F46E5] text-[#4F46E5] hover:bg-[#4F46E5]/5",
              )}
            >
              {selected && <Check className="size-4" />}
              {selected ? "Selected" : "Select Card"}
            </button>
          </div>
        )
      })}
    </div>
  )
}
