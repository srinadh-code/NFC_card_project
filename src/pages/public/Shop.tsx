import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  CheckCircle2,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Truck,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import PageHeader from "@/components/marketing/PageHeader"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { formatCurrency } from "@/lib/mock-api"
import { FLAGSHIP_PRODUCT } from "@/data/constants"
import { useCartStore } from "@/store/cart-store"
import { cn } from "@/lib/utils"
import { cardClass } from "@/components/marketing/PremiumCard"
import { NfcCardFace } from "@/components/marketing/NfcCardShowcase"
import { usePublicSettings } from "@/hooks/usePublicSettings"

// The card only ships in one premium finish now — no color picker — but
// CartLine/OrderItem still model a color, so we pass this fixed value through
// unchanged rather than reshaping those shared types for a single-SKU page.
const CARD_COLOR = FLAGSHIP_PRODUCT.colors[0]

// Displayed product copy for this page. `FLAGSHIP_PRODUCT` (from the shared,
// out-of-scope constants file) still supplies id/cardType/colors, but the
// name, price, and feature list shown here follow the client's latest brief.
const DISPLAY_NAME = "VR's NEXORA NFC Smart Card"
const DISPLAY_PRICE = 499

const DISPLAY_FEATURES = [
  "NFC Enabled",
  "Digital Business Profile",
  "QR Code",
  "Unlimited Profile Updates",
  "Social Links",
  "Analytics Dashboard",
]

const TRUST_BADGES = [
  { icon: Truck, label: "Free Shipping" },
  { icon: RotateCcw, label: "7 Days Return" },
  { icon: ShieldCheck, label: "Secure Payment" },
  { icon: CheckCircle2, label: "1 Year Warranty" },
]

export default function Shop() {
  const navigate = useNavigate()
  const addLine = useCartStore((s) => s.addLine)
  const { settings } = usePublicSettings()
  const [qty, setQty] = useState(1)
  const [logoName, setLogoName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setLogoName(file ? file.name : null)
  }

  function buildLine() {
    return {
      productId: FLAGSHIP_PRODUCT.id,
      name: DISPLAY_NAME,
      cardType: FLAGSHIP_PRODUCT.cardType,
      color: CARD_COLOR,
      qty,
      price: DISPLAY_PRICE,
      customLogo: logoName,
    }
  }

  function handleAddToCart() {
    addLine(buildLine())
    toast.success("Added to cart!")
  }

  function handleBuyNow() {
    addLine(buildLine())
    navigate("/checkout")
  }

  return (
    <div>
      <PageHeader
        title="VR's NEXORA NFC Smart Card"
        subtitle="One smart card that replaces your entire stack of paper business cards. Order yours below."
      />

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
                <h2 className="text-2xl font-bold text-foreground">{DISPLAY_NAME}</h2>
                {FLAGSHIP_PRODUCT.popular && (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    Most Popular
                  </span>
                )}
              </div>
              <p className="mt-3 bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#EC4899] bg-clip-text text-3xl font-bold text-transparent">
                {formatCurrency(DISPLAY_PRICE, settings.currency)}
              </p>
              <p className="mt-3 max-w-lg text-muted-foreground">{FLAGSHIP_PRODUCT.description}</p>
            </div>

            <ul className="space-y-3">
              {DISPLAY_FEATURES.map((feature) => (
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

            <div>
              <Label className="mb-3 block text-sm font-semibold text-foreground">
                Add Custom Logo (Optional)
              </Label>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="size-4" />
                  Choose File
                </Button>
                <span className="truncate text-sm text-muted-foreground">
                  {logoName ?? "No file chosen"}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFile}
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-[24px] border border-border bg-card p-5 shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Price</p>
                <p className="bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#EC4899] bg-clip-text text-2xl font-bold text-transparent">
                  {formatCurrency(DISPLAY_PRICE * qty, settings.currency)}
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

          {/* Right: premium card showcase — the exact same card component used
              on the About page, so both stay visually identical by construction */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative flex h-80 w-full max-w-sm items-center justify-center overflow-hidden rounded-[32px] bg-gradient-to-br from-[#0B0F1A] via-[#12142B] to-[#1A0F2E] p-8 shadow-2xl">
              <div className="pointer-events-none absolute left-1/4 top-1/5 size-56 rounded-full bg-[#7C3AED]/30 blur-[90px]" />
              <div className="pointer-events-none absolute bottom-1/5 right-1/4 size-56 rounded-full bg-[#2563EB]/30 blur-[90px]" />
              <div className="relative h-44 w-full max-w-xs animate-float-slow">
                <div className="h-full w-full -rotate-3 cursor-pointer transition-transform duration-500 ease-out hover:-rotate-1 hover:scale-[1.04]">
                  <NfcCardFace tone="front" />
                </div>
              </div>
            </div>
            <p className="mt-6 max-w-xs text-center text-sm text-muted-foreground">
              Every {DISPLAY_NAME} ships in this premium matte-black finish with brand-gradient trim.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
