import { Star } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Shared 1-5 star control — interactive (customer's review form) or
 * read-only (admin table/detail, public testimonial cards) via the same
 * component, so the visual language of "a star rating" only exists once.
 * Accessible as a real radiogroup: arrow/tab navigation and screen readers
 * announce "Rate N stars", not five unlabeled buttons.
 */
function StarRating({
  value,
  onChange,
  readOnly = false,
  size = "default",
  className,
}: {
  value: number
  onChange?: (value: number) => void
  readOnly?: boolean
  size?: "sm" | "default" | "lg"
  className?: string
}) {
  const starSize = size === "sm" ? "size-4" : size === "lg" ? "size-8" : "size-6"

  if (readOnly) {
    return (
      <div className={cn("flex items-center gap-0.5", className)} role="img" aria-label={`${value} out of 5 stars`}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className={cn(starSize, i < value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/25")}
            aria-hidden="true"
          />
        ))}
      </div>
    )
  }

  return (
    <div className={cn("flex items-center gap-1", className)} role="radiogroup" aria-label="Rating">
      {Array.from({ length: 5 }, (_, i) => {
        const starValue = i + 1
        return (
          <button
            key={starValue}
            type="button"
            role="radio"
            aria-checked={value === starValue}
            aria-label={`Rate ${starValue} star${starValue > 1 ? "s" : ""}`}
            onClick={() => onChange?.(starValue)}
            className="rounded-sm outline-none transition-transform hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Star
              className={cn(starSize, starValue <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
            />
          </button>
        )
      })}
    </div>
  )
}

export { StarRating }
