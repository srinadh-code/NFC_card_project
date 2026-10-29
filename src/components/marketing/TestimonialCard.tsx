import { Star } from "lucide-react"
import type { PublicTestimonial } from "@/types/testimonial"
import PremiumCard from "@/components/marketing/PremiumCard"
import { TestimonialAvatar } from "@/components/marketing/TestimonialAvatar"

interface TestimonialCardProps {
  testimonial: PublicTestimonial
}

export default function TestimonialCard({ testimonial }: TestimonialCardProps) {
  const subtitle = [testimonial.designation, testimonial.company].filter(Boolean).join(" @ ")

  return (
    <PremiumCard className="flex h-full flex-col p-6">
      <div className="flex items-center gap-1" role="img" aria-label={`${testimonial.rating} out of 5 stars`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            aria-hidden="true"
            className={
              i < testimonial.rating
                ? "size-4 fill-[#EC4899] text-[#EC4899]"
                : "size-4 text-muted-foreground/25"
            }
          />
        ))}
      </div>
      <p className="mt-4 flex-1 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
        &ldquo;{testimonial.review}&rdquo;
      </p>
      <div className="mt-6 flex items-center gap-3">
        <TestimonialAvatar src={testimonial.profile_image} name={testimonial.name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{testimonial.name}</p>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </PremiumCard>
  )
}
