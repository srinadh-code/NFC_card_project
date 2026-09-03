import { Star } from "lucide-react"
import type { Testimonial } from "@/types"
import PremiumCard from "@/components/marketing/PremiumCard"

interface TestimonialCardProps {
  testimonial: Testimonial
}

export default function TestimonialCard({ testimonial }: TestimonialCardProps) {
  return (
    <PremiumCard className="flex h-full flex-col p-6">
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={
              i < testimonial.rating
                ? "size-4 fill-[#EC4899] text-[#EC4899]"
                : "size-4 text-muted-foreground/25"
            }
          />
        ))}
      </div>
      <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">
        &ldquo;{testimonial.quote}&rdquo;
      </p>
      <div className="mt-6 flex items-center gap-3">
        <img
          src={testimonial.avatar}
          alt={testimonial.name}
          className="size-11 rounded-full bg-[#F8FAFC]"
        />
        <div>
          <p className="text-sm font-semibold text-foreground">{testimonial.name}</p>
          <p className="text-xs text-muted-foreground">
            {testimonial.role} @ {testimonial.company}
          </p>
        </div>
      </div>
    </PremiumCard>
  )
}
