import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { NEXORA_CARD_TYPES } from "@/data/constants"
import type { CardType } from "@/types"

// The NFC inventory's `card_type` (Classic/Premium/Wooden/Custom) is a
// backend-fixed enum used across orders/products too. This is a
// display-layer mapping onto the public site's finalized NEXORA plans (see
// NEXORA_CARD_TYPES in data/constants.ts, the source of truth) — Classic,
// Premium and Custom all match by name now, so this is mostly a passthrough.
// "Wooden" has no NEXORA-plan equivalent (no plan maps to it), so it's
// shown as its own neutral label rather than force-fit into one of the
// three — inventing that mapping isn't something the public site defines.
export const PLAN_BY_CARD_TYPE: Partial<Record<CardType, (typeof NEXORA_CARD_TYPES)[number]>> = Object.fromEntries(
  NEXORA_CARD_TYPES.map((plan) => [plan.cardType, plan]),
)

// One accent color per plan, shared by the badge below and by
// CardFormDialog's plan-type selector — a single source so the two never
// drift out of sync with each other.
export const PLAN_ACCENT: Record<string, string> = {
  classic: "#4F46E5",
  premium: "#F59E0B",
  custom: "#7C3AED",
}

const PLAN_BADGE_CLASS: Record<string, string> = {
  classic: "border-[#4F46E5]/20 bg-[#4F46E5]/10 text-[#4F46E5]",
  premium: "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#B45309]",
  custom: "border-[#7C3AED]/25 bg-gradient-to-r from-[#4F46E5]/10 via-[#7C3AED]/10 to-[#EC4899]/10 text-[#7C3AED]",
}

export function PlanTypeBadge({ cardType, className }: { cardType: CardType; className?: string }) {
  const plan = PLAN_BY_CARD_TYPE[cardType]
  if (!plan) {
    // Wooden (or any future backend value with no NEXORA-plan mapping).
    return (
      <Badge variant="secondary" className={className}>
        {cardType}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className={cn(PLAN_BADGE_CLASS[plan.id], className)}>
      {plan.name.replace("NEXORA ", "")}
    </Badge>
  )
}
