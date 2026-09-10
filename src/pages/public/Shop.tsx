import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { CheckCircle2, LayoutTemplate, Minus, Plus, RotateCcw, ShieldCheck, Truck } from "lucide-react"
import { toast } from "sonner"
import PageHeader from "@/components/marketing/PageHeader"
import NexoraCardSelector from "@/components/marketing/NexoraCardSelector"
import ProfileThemeShowcase from "@/components/marketing/ProfileThemeShowcase"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { formatCurrency } from "@/lib/mock-api"
import { CARD_THEME_IDS, NEXORA_CARD_TYPES, PROFILE_THEMES } from "@/data/constants"
import { useCartStore } from "@/store/cart-store"
import { cn } from "@/lib/utils"
import { cardClass, gradientClass } from "@/components/marketing/PremiumCard"
import { NfcCardFace } from "@/components/marketing/NfcCardShowcase"
import { usePublicSettings } from "@/hooks/usePublicSettings"

const TRUST_BADGES = [
  { icon: Truck, label: "Free Shipping" },
  { icon: RotateCcw, label: "7 Days Return" },
  { icon: ShieldCheck, label: "Secure Payment" },
  { icon: CheckCircle2, label: "1 Year Warranty" },
]

// Plan-specific explanation copy for the Profile Theme section — kept
// separate from NEXORA_CARD_TYPES since it describes the *theme choice*,
// not the card itself, and only applies on this one section.
const THEME_PLAN_COPY: Record<(typeof NEXORA_CARD_TYPES)[number]["id"], string> = {
  classic: "One clean professional profile theme included.",
  premium: "Choose one of three professionally designed profile themes.",
  custom: "Choose one of five premium themes with full customization options.",
}

export default function Shop() {
  const navigate = useNavigate()
  const addLine = useCartStore((s) => s.addLine)
  const [selectedId, setSelectedId] = useState<(typeof NEXORA_CARD_TYPES)[number]["id"]>("premium")
  const { settings } = usePublicSettings()
  const [qty, setQty] = useState(1)

  // NEXORA_CARD_TYPES always has all 3 tiers, so this is never undefined —
  // the single source of truth every section below reads from.
  const selectedCard = NEXORA_CARD_TYPES.find((c) => c.id === selectedId) ?? NEXORA_CARD_TYPES[0]
  // Each tier owns a disjoint set of themes (see CARD_THEME_IDS) — Classic,
  // Premium and Custom each get their own 1/3/5, never a shared/overlapping
  // pick, so no theme ever appears under more than one tier. This section
  // is a pure showcase (no selection state) — see ProfileThemeShowcase.
  const availableThemeIds = CARD_THEME_IDS[selectedCard.id] ?? []
  const availableThemes = PROFILE_THEMES.filter((t) => availableThemeIds.includes(t.id))

  function buildLine() {
    return {
      productId: `PRD-NEXORA-${selectedCard.id.toUpperCase()}`,
      name: selectedCard.name,
      cardType: selectedCard.cardType,
      color: selectedCard.color,
      qty,
      price: selectedCard.price,
    }
  }

  function validate(): boolean {
    if (qty < 1) {
      toast.error("Quantity must be at least 1.")
      return false
    }
    return true
  }

  function handleAddToCart() {
    if (!validate()) return
    addLine(buildLine())
    toast.success("Added to cart!")
  }

  function handleBuyNow() {
    if (!validate()) return
    addLine(buildLine())
    navigate("/checkout")
  }

  return (
    <div>
      <PageHeader
        title="Choose Your NEXORA Card"
        subtitle="Select the card that best fits your style and professional needs."
      />

      {/* 1. Choose Your NEXORA Card */}
      <section className="bg-[#F8FAFC] px-4 py-16">
        <div className="mx-auto max-w-[1320px]">
          <NexoraCardSelector cardTypes={NEXORA_CARD_TYPES} selectedId={selectedId} onSelect={setSelectedId} />

          {/* Template count summary strip — visually integrated, not a
              plain table, reading straight off the same card config. */}
          <div className={cn(cardClass, "mt-8 flex flex-col divide-y divide-[#E2E8F0] p-0 hover:translate-y-0 hover:shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:flex-row sm:divide-x sm:divide-y-0")}>
            {NEXORA_CARD_TYPES.map((card) => (
              <div key={card.id} className="flex flex-1 items-center gap-3 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <LayoutTemplate className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{card.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(card.price, settings.currency)} · {card.templateCount}{" "}
                    {card.templateCount === 1 ? "Template" : "Templates"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Selected card + detailed ordering — appears exactly once, at
          the end of the page. */}
      <section className="bg-secondary px-4 py-16">
        <div
          className={cn(
            cardClass,
            "mx-auto grid max-w-[1320px] gap-12 p-6 hover:translate-y-0 hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:p-10 lg:grid-cols-2",
          )}
        >
          {/* Left: product info + configurator */}
          <div className="space-y-8">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-foreground">{selectedCard.name}</h2>
                {selectedCard.popular && (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    Most Popular
                  </span>
                )}
              </div>
              <p className={cn("mt-3 bg-gradient-to-r bg-clip-text text-3xl font-bold text-transparent", gradientClass)}>
                {formatCurrency(selectedCard.price, settings.currency)}
              </p>
              <p className="mt-3 max-w-lg text-muted-foreground">{selectedCard.design}</p>
            </div>

            {/* Selected-card summary — the only place these three values
                are read from is `selectedCard`, so switching tiers above
                updates everything here automatically. */}
            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Selected Card</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{selectedCard.name.replace("NEXORA ", "")}</p>
              </div>
              <div className="border-x border-[#E2E8F0]">
                <p className="text-xs text-muted-foreground">Price</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(selectedCard.price, settings.currency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Templates Included</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{selectedCard.templateCount}</p>
              </div>
            </div>

            <ul className="space-y-3">
              {selectedCard.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm font-medium text-foreground">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>

            <div>
              <Label className="mb-3 block text-sm font-semibold text-foreground">Quantity</Label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-10 text-center text-lg font-semibold">{qty}</span>
                <Button variant="outline" size="icon" onClick={() => setQty((q) => q + 1)} aria-label="Increase quantity">
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-[24px] border border-border bg-card p-5 shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Price</p>
                <p className={cn("bg-gradient-to-r bg-clip-text text-2xl font-bold text-transparent", gradientClass)}>
                  {formatCurrency(selectedCard.price * qty, settings.currency)}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-primary text-primary transition-all duration-300 hover:bg-primary/5"
                  onClick={handleAddToCart}
                >
                  Add To Cart
                </Button>
                <Button
                  size="lg"
                  className="rounded-xl bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#EC4899] text-white shadow-[0_10px_30px_rgba(79,70,229,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_15px_35px_rgba(79,70,229,0.45)]"
                  onClick={handleBuyNow}
                >
                  Buy Now
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TRUST_BADGES.map((b) => (
                <div
                  key={b.label}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center"
                >
                  <b.icon className="size-5 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: premium card showcase — the tone (and therefore the
              visual finish) follows the selected NEXORA tier. */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative flex h-80 w-full max-w-sm items-center justify-center overflow-hidden rounded-[32px] bg-gradient-to-br from-[#0B0F1A] via-[#12142B] to-[#1A0F2E] p-8 shadow-2xl">
              <div className="pointer-events-none absolute left-1/4 top-1/5 size-56 rounded-full bg-[#7C3AED]/30 blur-[90px]" />
              <div className="pointer-events-none absolute bottom-1/5 right-1/4 size-56 rounded-full bg-[#2563EB]/30 blur-[90px]" />
              <div className="relative h-44 w-full max-w-xs animate-float-slow">
                <div className="h-full w-full -rotate-3 cursor-pointer transition-transform duration-500 ease-out hover:-rotate-1 hover:scale-[1.04]">
                  <NfcCardFace tone={selectedCard.cardTone} />
                </div>
              </div>
            </div>
            <p className="mt-6 max-w-xs text-center text-sm text-muted-foreground">
              Every {selectedCard.name} ships in this finish: {selectedCard.design.toLowerCase()}.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Choose Your Profile Theme — the final customization step,
          appearing only here at the end of the page, before the footer.
          Available themes are entirely driven by selectedCard above; no
          logic here duplicates the card-selection state. */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-[1320px]">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Choose Your Profile Theme
            </h2>
            <p className="mt-3 text-muted-foreground">
              Personalize your digital identity with a profile style that matches you.
            </p>

            <span className="mt-5 inline-block rounded-full bg-[#4F46E5]/10 px-4 py-1.5 text-xs font-bold tracking-wider text-[#4F46E5]">
              {selectedCard.id.toUpperCase()} • {selectedCard.templateCount}{" "}
              {selectedCard.templateCount === 1 ? "THEME" : "THEMES"} INCLUDED
            </span>
            <p className="mt-3 text-sm text-muted-foreground">{THEME_PLAN_COPY[selectedCard.id]}</p>
          </div>

          <div className="mt-10">
            <ProfileThemeShowcase themes={availableThemes} />
          </div>
        </div>
      </section>
    </div>
  )
}
