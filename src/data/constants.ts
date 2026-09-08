import type { Product } from "@/types"

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
    name: "VR's NEXORA Standard Card",
    cardType: "Standard",
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
    cardType: "Metal",
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
