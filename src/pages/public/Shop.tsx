import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  CheckCircle2,
  CreditCard,
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
  const [color, setColor] = useState(FLAGSHIP_PRODUCT.colors[0])
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
      color,
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
        subtitle="One smart card that replaces your entire stack of paper business cards. Configure yours below."
      />

      <section className="bg-[#F8FAFC] px-4 py-16">
        <div
          className={cn(
            cardClass,
            "mx-auto grid max-w-6xl gap-12 p-6 hover:translate-y-0 hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:p-10 lg:grid-cols-2",
          )}
        >
          {/* Left: product info + configurator */}
          <div className="space-y-8">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-foreground">{DISPLAY_NAME}</h2>
                {FLAGSHIP_PRODUCT.popular && (
                  <span className="rounded-full bg-[#4F46E5]/10 px-3 py-1 text-xs font-semibold text-[#4F46E5]">
                    Most Popular
                  </span>
                )}
              </div>
              <p className="mt-3 bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#EC4899] bg-clip-text text-3xl font-bold text-transparent">
                {formatCurrency(DISPLAY_PRICE)}
              </p>
              <p className="mt-3 max-w-lg text-muted-foreground">{FLAGSHIP_PRODUCT.description}</p>
            </div>

            <ul className="space-y-3">
              {DISPLAY_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm font-medium text-foreground">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#4F46E5]" />
                  {feature}
                </li>
              ))}
            </ul>

            <div>
              <Label className="mb-3 block text-sm font-semibold text-foreground">Color</Label>
              <div className="flex flex-wrap gap-3">
                {FLAGSHIP_PRODUCT.colors.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    title={c.name}
                    onClick={() => setColor(c)}
                    className={cn(
                      "size-10 rounded-full border-2 shadow-sm transition-transform duration-200 hover:scale-110",
                      color.name === c.name ? "border-[#4F46E5] ring-2 ring-[#4F46E5]/40" : "border-transparent",
                    )}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Selected: {color.name}</p>
            </div>

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

            <div className="flex flex-col gap-4 rounded-[24px] border border-[#E2E8F0] bg-[#F8FAFC] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.06)] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Price</p>
                <p className="bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#EC4899] bg-clip-text text-2xl font-bold text-transparent">
                  {formatCurrency(DISPLAY_PRICE * qty)}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-[#4F46E5] text-[#4F46E5] transition-all duration-300 hover:bg-[#4F46E5]/5"
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
                  className="flex flex-col items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-center"
                >
                  <b.icon className="size-5 text-[#4F46E5]" />
                  <span className="text-xs font-medium text-muted-foreground">{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: live preview */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative flex h-80 w-full max-w-sm items-center justify-center">
              <div className="absolute size-72 rounded-full bg-[#4F46E5]/10 blur-3xl" />
              <div
                className="relative z-10 flex h-52 w-full max-w-xs items-center justify-center rounded-2xl shadow-2xl transition-colors"
                style={{ backgroundColor: color.hex }}
              >
                <CreditCard className="size-16 text-white/90" />
                <span className="absolute bottom-4 left-4 text-sm font-semibold text-white/90">
                  {DISPLAY_NAME}
                </span>
              </div>
            </div>
            <p className="mt-6 max-w-xs text-center text-sm text-muted-foreground">
              Live preview — the card color updates instantly as you customize it above.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
