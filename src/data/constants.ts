import type { Product, Testimonial } from "@/types"

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

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "TST01",
    name: "Ananya Reddy",
    role: "Founder & CEO",
    company: "Nimbus Growth Studio",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=ananya-reddy",
    rating: 5,
    quote:
      "VR's NEXORA replaced an entire box of paper cards. I tap my phone at every event now and my whole profile — portfolio, socials, contact — opens instantly for the other person.",
  },
  {
    id: "TST02",
    name: "Rahul Menon",
    role: "VP of Sales",
    company: "Orbital Systems",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=rahul-menon",
    rating: 5,
    quote:
      "Our field sales team activated 40 cards in a day. The analytics dashboard alone justified the switch — we finally know which conversations turn into leads.",
  },
  {
    id: "TST03",
    name: "Priya Nair",
    role: "Freelance Designer",
    company: "Studio Nair",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=priya-nair",
    rating: 5,
    quote:
      "Clients are always impressed when I tap my card on their phone. Updating my portfolio link takes ten seconds and everyone who has my card automatically sees the latest version.",
  },
  {
    id: "TST04",
    name: "Karthik Iyer",
    role: "Co-Founder",
    company: "Ledgerly",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=karthik-iyer",
    rating: 4,
    quote:
      "Setup took less than five minutes. The QR fallback is a nice touch for people whose phones don't support NFC — nobody gets left out.",
  },
  {
    id: "TST05",
    name: "Sneha Kulkarni",
    role: "HR Business Partner",
    company: "Vertex Retail",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=sneha-kulkarni",
    rating: 5,
    quote:
      "We rolled out VR's NEXORA cards to the whole leadership team. Managing everyone's cards from one admin panel makes onboarding new hires painless.",
  },
  {
    id: "TST06",
    name: "Arjun Desai",
    role: "Business Development Manager",
    company: "Skyline Exports",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=arjun-desai",
    rating: 4,
    quote:
      "I travel constantly for trade shows. Being able to update my number and email from my phone the moment they change — without reprinting anything — has saved me real money.",
  },
]

export const FAQS = [
  {
    q: "What is an NFC card?",
    a: "An NFC (Near Field Communication) card is a smart card embedded with a chip that lets you share your digital business card, social profiles, and contact details with a single tap on any NFC-enabled smartphone — no app required.",
  },
  {
    q: "How does VR's NEXORA card work?",
    a: "Simply tap your VR's NEXORA card on the back of any NFC-enabled smartphone. Your digital profile opens instantly in the recipient's browser, letting them view your details, save your contact, and connect on social media. If NFC isn't supported, they can scan the QR code instead.",
  },
  {
    q: "Do I need any app to use the card?",
    a: "No. Recipients don't need to install any app to view your profile. You only need to sign in to your VR's NEXORA dashboard to activate and manage your card and profile.",
  },
  {
    q: "Can I update my profile details later?",
    a: "Yes, absolutely. You can update your name, designation, company, photo, bio, and social links anytime from your customer dashboard. Changes reflect instantly on your live profile without needing a new card.",
  },
  {
    q: "Is my data secure?",
    a: "Yes. We use industry-standard encryption for all stored data and never share your information with third parties without consent. You have full control over which details are visible on your public profile.",
  },
  {
    q: "What if my card is lost or damaged?",
    a: "You can order a replacement card from your dashboard and simply reassign your existing profile to the new card's UID. Your profile link and QR code remain unaffected.",
  },
  {
    q: "How long does delivery take?",
    a: "Orders are typically processed within 1-2 business days and delivered within 5-7 business days across India via our logistics partners.",
  },
  {
    q: "Can I use one VR's NEXORA card for a business team?",
    a: "Yes, our Business and Enterprise plans support bulk card ordering and centralized team management from a single admin panel.",
  },
]
