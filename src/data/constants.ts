import type { CardType } from "@/types"
import type { NfcCardTone } from "@/components/marketing/NfcCardShowcase"
import googleReviewCardImage from "@/assets/google-review-card.webp"

export const CARD_COLORS = [
  { name: "Black", hex: "#111111" },
  { name: "Blue", hex: "#2563eb" },
  { name: "Red", hex: "#dc2626" },
  { name: "White", hex: "#f4f4f5" },
  { name: "Green", hex: "#16a34a" },
] as const

// `PRODUCTS`/`FLAGSHIP_PRODUCT` (an old Classic/Premium/Wooden/Metal catalog
// and a flagship SKU, both unused by any page — Shop.tsx reads from
// NEXORA_CARD_TYPES instead) were removed: they only ever held retired
// Classic/Premium card-type data.

export const FLAGSHIP_FEATURES = [
  "NFC Enabled — tap to share instantly",
  "QR Code Included for non-NFC devices",
  "Fully Editable Digital Profile",
  "Lifetime Free Updates",
]

// ---------------------------------------------------------------------
// Order Card page catalog. As of the Order Card CMS (website_content.
// OrderCardProduct), Shop.tsx itself no longer reads NEXORA_CARD_TYPES
// below — it fetches the real, admin-editable catalog from the backend
// and maps it onto this same shape (see toNexoraCardType in Shop.tsx), so
// NexoraCardSelector/ProfileThemeShowcase need no changes. This array
// remains the source of truth only for its few remaining static
// consumers: QrCode.tsx's Google Review upsell card, and admin's
// PlanTypeBadge/CardFormDialog plan-label lookups. Those will show stale
// data if the catalog is edited in Website Content → Order Card — a known
// limitation, not (yet) propagated to every consumer.
//
// `cardType` maps each entry onto the existing CardType enum so it flows
// through the existing CartLine/OrderItem/checkout pipeline unchanged.
// ---------------------------------------------------------------------

export interface NexoraCardType {
  // A plain string, not a fixed literal union: Shop.tsx's product catalog
  // (its "id" is a product's `slug`) is now admin-editable — see
  // website_content.OrderCardProduct / OrderCardTab.tsx — so the exact set
  // of ids is no longer fixed at build time. The two ids used below
  // ("custom"/"google-review") stay valid `string`s regardless.
  id: string
  name: string
  price: number
  design: string
  bestFor: string
  // Omitted entirely for a product with no profile-template entitlement
  // (e.g. Google Review Card) — every read site treats "no value" the same
  // as "hide the template-count UI", rather than displaying a count of 0.
  templateCount?: number
  features: string[]
  cardType: CardType
  // NfcCardFace-drawn mockup tone — used only when `image` isn't set.
  cardTone?: NfcCardTone
  // A real product photo (e.g. Google Review Card's actual card design),
  // shown instead of the drawn NfcCardFace mockup when present. See the
  // "card showcase" panel in Shop.tsx.
  image?: string
  // Caption shown under the card-showcase image on Shop.tsx. Falls back to
  // "Every {name} ships in this finish: {design}" when omitted (NEXORA
  // Custom's case) — set this when a product needs different copy under
  // the image than in its main description (e.g. Google Review Card).
  imageCaption?: string
  color: { name: string; hex: string }
  popular?: boolean
  // Explanatory line for the Profile Theme section, specific to this
  // product — set only by Shop.tsx's API-driven mapping (see
  // toNexoraCardType there); the other static consumers of this type
  // (PlanTypeBadge, CardFormDialog, QrCode.tsx) never set or read it.
  themePlanCopy?: string
}

// NEXORA Classic and NEXORA Premium have been retired and removed from sale.
// Custom remains the flagship NEXORA tier; Google Review Card is a separate
// (non-NEXORA-branded, no profile-template entitlement) product sold
// alongside it on the same Shop page — see the omitted templateCount below
// and the Shop.tsx guard that hides the profile-theme section when it's
// selected.
export const NEXORA_CARD_TYPES: NexoraCardType[] = [
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
  {
    id: "google-review",
    name: "Google Review Card",
    price: 499,
    design: "Make it easy for customers to leave a Google Review with a simple scan.",
    bestFor: "Businesses & Local Stores",
    // Not a NEXORA profile-card tier — no digital profile/template comes
    // with it, so templateCount is omitted rather than set to 0.
    cardType: "Review",
    image: googleReviewCardImage,
    imageCaption: "Make it easy for customers to find your Google Review page and share their feedback.",
    color: { name: "Black", hex: "#111111" },
    // A Google Review collection card, not a digital business profile —
    // NFC isn't called out here even though the card supports it
    // technically, since the primary benefit is the QR scan straight to
    // the business's Google Review page.
    features: [
      "Google Review QR Code",
      "One-Scan Review Access",
      "Direct Link to Your Google Review Page",
      "Easy for Customers to Leave Feedback",
      "Durable Business Review Card",
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

// Which themes belong to which card tier. Keyed by NexoraCardType["id"],
// kept as a separate lookup (rather than a field on NEXORA_CARD_TYPES) so
// card-selection data stays untouched by this. Custom's "signature"/
// "creative"/"executive"/"classic" siblings were Premium/Classic-exclusive
// themes; now that those tiers are retired, Custom keeps only the 5 themes
// it always had — those three former-Premium themes aren't reachable from
// the Shop showcase anymore, though PROFILE_THEMES above still lists them
// (unrelated systems still reference those ids: any customer's existing
// `selectedTemplate`, and the base "classic" default new profiles start on).
export const CARD_THEME_IDS: Record<string, string[]> = {
  custom: ["luxury", "future", "nature", "glass", "impact"],
}
