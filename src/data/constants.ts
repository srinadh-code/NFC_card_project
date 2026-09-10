import type { CardType, Product } from "@/types"
import type { NfcCardTone } from "@/components/marketing/NfcCardShowcase"

export const CARD_COLORS = [
  { name: "Black", hex: "#111111" },
  { name: "Blue", hex: "#2563eb" },
  { name: "Red", hex: "#dc2626" },
  { name: "White", hex: "#f4f4f5" },
  { name: "Green", hex: "#16a34a" },
] as const

export const PRODUCTS: Product[] = [
  {
    id: "PRD-STD",
    name: "VR's NEXORA Classic Card",
    cardType: "Classic",
    description: "Durable PVC NFC card with custom QR code and profile link.",
    price: 599,
    colors: CARD_COLORS.slice(0, 4).map((c) => ({ ...c })),
    image: "standard",
  },
  {
    id: "PRD-PRM",
    name: "VR's NEXORA Premium Card",
    cardType: "Premium",
    description: "Matte finish premium PVC card with priority analytics access.",
    price: 999,
    colors: CARD_COLORS.map((c) => ({ ...c })),
    image: "premium",
    popular: true,
  },
  {
    id: "PRD-WOD",
    name: "VR's NEXORA Wooden Card",
    cardType: "Wooden",
    description: "Eco-friendly engraved wooden NFC card, a true conversation starter.",
    price: 799,
    colors: [CARD_COLORS[0], { name: "Natural", hex: "#a9784f" }],
    image: "wooden",
  },
  {
    id: "PRD-MTL",
    name: "VR's NEXORA Metal Card",
    cardType: "Custom",
    description: "Premium brushed metal card with laser engraving, built to last.",
    price: 1499,
    colors: [CARD_COLORS[0], { name: "Silver", hex: "#c0c0c8" }, { name: "Gold", hex: "#d4af37" }],
    image: "metal",
  },
]

// The Shop page sells a single flagship SKU; `PRODUCTS` above is kept for
// order-history rendering (past orders reference these product ids/types).
export const FLAGSHIP_PRODUCT: Product = {
  id: "PRD-FLAGSHIP",
  name: "VR's NEXORA NFC Business Card",
  cardType: "Premium",
  description:
    "One smart card that replaces your entire stack of paper business cards — tap to share your digital profile instantly.",
  price: 500,
  colors: CARD_COLORS.map((c) => ({ ...c })),
  image: "flagship",
  popular: true,
}

export const FLAGSHIP_FEATURES = [
  "NFC Enabled — tap to share instantly",
  "QR Code Included for non-NFC devices",
  "Fully Editable Digital Profile",
  "Lifetime Free Updates",
]

// ---------------------------------------------------------------------
// Order Card page — the 3 NEXORA tiers. Single source of truth for price,
// feature list, and profile-template entitlement: every place that needs
// any of these (the selector cards, the configurator, the comparison
// strip, the template showcase) reads from here rather than repeating
// values inline, so there's exactly one place to update pricing/features.
//
// `cardType` maps each tier onto the existing CardType enum so a selected
// tier flows through the existing CartLine/OrderItem/checkout pipeline
// completely unchanged — no new field, no backend change needed.
// ---------------------------------------------------------------------

export interface NexoraCardType {
  id: "classic" | "premium" | "custom"
  name: string
  price: number
  design: string
  bestFor: string
  templateCount: number
  features: string[]
  cardType: CardType
  cardTone: NfcCardTone
  color: { name: string; hex: string }
  popular?: boolean
}

export const NEXORA_CARD_TYPES: NexoraCardType[] = [
  {
    id: "classic",
    name: "NEXORA Classic",
    price: 499,
    design: "Matte Black PVC, gradient logo",
    bestFor: "Individuals & Students",
    templateCount: 1,
    cardType: "Classic",
    cardTone: "front",
    color: { name: "Matte Black", hex: "#111111" },
    features: [
      "NFC Enabled",
      "Digital Business Profile",
      "QR Code",
      "Unlimited Profile Updates",
      "Social Links",
      "Analytics Dashboard",
    ],
  },
  {
    id: "premium",
    name: "NEXORA Premium",
    price: 799,
    design: "Premium metal finish, premium black design",
    bestFor: "Professionals & Executives",
    templateCount: 3,
    cardType: "Premium",
    cardTone: "gold",
    color: { name: "Gunmetal Gold", hex: "#d4af37" },
    popular: true,
    features: [
      "NFC Enabled",
      "Digital Business Profile",
      "QR Code",
      "Unlimited Profile Updates",
      "Social Links",
      "Analytics Dashboard",
      "Premium Metal Finish",
    ],
  },
  {
    id: "custom",
    name: "NEXORA Custom",
    price: 999,
    design: "Custom color, logo and design",
    bestFor: "Businesses & Brands",
    templateCount: 5,
    cardType: "Custom",
    cardTone: "custom",
    color: { name: "Custom", hex: "#7C3AED" },
    features: [
      "NFC Enabled",
      "Digital Business Profile",
      "QR Code",
      "Unlimited Profile Updates",
      "Social Links",
      "Analytics Dashboard",
      "Custom Color",
      "Custom Logo",
      "Custom Design",
    ],
  },
]

// ---------------------------------------------------------------------
// Profile theme showcase (Order Card page, final section) — 9 total
// themes, each belonging to exactly one tier (see CARD_THEME_IDS below).
// Unlike an earlier version of this feature, entitlement is NOT "the
// first N of a shared list" — Classic/Premium/Custom each get their own
// disjoint set of themes, so nothing is ever repeated across tiers.
// No photo/asset files back these; each is a code-built mockup (same
// approach as NfcCardFace's card preview) — a generic silhouette avatar
// and "Your Name" placeholder stand in for any real person's photo/name.
// ---------------------------------------------------------------------

export interface ProfileTheme {
  id: string
  name: string
  tagline: string
}

export const PROFILE_THEMES: ProfileTheme[] = [
  { id: "classic", name: "NEXORA Classic", tagline: "Clean. Professional. Timeless." },
  { id: "signature", name: "NEXORA Signature", tagline: "Elegant. Personal. Memorable." },
  { id: "creative", name: "NEXORA Creative", tagline: "Bold. Modern. Expressive." },
  { id: "executive", name: "NEXORA Executive", tagline: "Professional. Powerful. Sophisticated." },
  { id: "luxury", name: "NEXORA Luxury", tagline: "Premium. Sophisticated. Exclusive." },
  { id: "future", name: "NEXORA Future", tagline: "Futuristic. Digital. Innovative." },
  { id: "nature", name: "NEXORA Nature", tagline: "Organic. Calm. Natural." },
  { id: "glass", name: "NEXORA Glass", tagline: "Modern. Premium. Transparent." },
  { id: "impact", name: "NEXORA Impact", tagline: "Confident. Dynamic. Powerful." },
]

// Which themes belong to which card tier — disjoint sets (no id appears
// under more than one key), 1 + 3 + 5 = 9 unique themes total. Keyed by
// NexoraCardType["id"], kept as a separate lookup (rather than a field on
// NEXORA_CARD_TYPES) so card-selection data stays untouched by this.
export const CARD_THEME_IDS: Record<string, string[]> = {
  classic: ["classic"],
  premium: ["signature", "creative", "executive"],
  custom: ["luxury", "future", "nature", "glass", "impact"],
}
