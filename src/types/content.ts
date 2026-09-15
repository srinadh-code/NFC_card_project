// Domain types for the Website Content CMS module (admin-managed public
// marketing site content). Mirrors the Django `website_content` app's
// serializers 1:1 — see tracker-backend/website_content/serializers/*.py.

export interface WithId {
  id: number
}

// ---------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------

export interface Hero extends WithId {
  badge: string
  heading_line1: string
  heading_line2: string
  description: string
  primary_cta_text: string
  primary_cta_link: string
  secondary_cta_text: string
  secondary_cta_link: string
  phone_image_url: string | null
  nfc_card_image_url: string | null
  is_active: boolean
}

export interface HeroFeature extends WithId {
  icon: string
  label: string
  description: string
  display_order: number
  is_active: boolean
}

export interface BottomBarItem extends WithId {
  icon: string
  title: string
  description: string
  display_order: number
  is_active: boolean
}

export interface HowItFeels extends WithId {
  badge: string
  heading: string
  description: string
  is_active: boolean
}

export interface HowItFeelsPoint extends WithId {
  icon: string
  text: string
  display_order: number
  is_active: boolean
}

export interface Cta extends WithId {
  heading: string
  description: string
  button_text: string
  button_link: string
  is_active: boolean
}

// ---------------------------------------------------------------------
// About
// ---------------------------------------------------------------------

export interface AboutPage extends WithId {
  page_title: string
  page_subtitle: string
  story_badge: string
  story_title: string
  story_paragraph_1: string
  story_paragraph_2: string
  story_image_url: string
  is_active: boolean
}

export interface AboutFeature extends WithId {
  label: string
  icon: string
  display_order: number
  is_active: boolean
}

export interface Mission extends WithId {
  badge: string
  heading: string
  description: string
  is_active: boolean
}

export interface WhyChoose extends WithId {
  title: string
  description: string
  icon: string
  gradient: string
  display_order: number
  is_active: boolean
}

export interface BuiltFromExperience extends WithId {
  heading: string
  subtitle: string
  paragraph_1: string
  paragraph_2: string
  image_url: string | null
  is_active: boolean
}

// ---------------------------------------------------------------------
// Shared resources
// ---------------------------------------------------------------------

export interface Value extends WithId {
  title: string
  description: string
  icon: string
  display_order: number
  is_active: boolean
}

export interface Feature extends WithId {
  icon: string
  title: string
  description: string
  display_order: number
  is_active: boolean
}

export interface HowItWorksStep extends WithId {
  step_number: number
  icon: string
  title: string
  description: string
  display_order: number
  is_active: boolean
}

export interface Faq extends WithId {
  question: string
  answer: string
  display_order: number
  is_active: boolean
}

export interface Testimonial extends WithId {
  name: string
  designation: string
  company: string
  review: string
  rating: number
  image_url: string | null
  display_order: number
  is_active: boolean
}

export interface Company extends WithId {
  name: string
  logo_url: string | null
  display_order: number
  is_active: boolean
}

export type StatisticPage = "home" | "about" | "features"

export interface Statistic extends WithId {
  page: StatisticPage
  value: string
  label: string
  icon: string
  display_order: number
  is_active: boolean
}

// ---------------------------------------------------------------------
// Features page — fully CMS-driven, separate from the shared `Feature`
// model above (which is Home's "Why Choose" cards only). Statistics for
// this page reuse the shared Statistic model with page="features".
// ---------------------------------------------------------------------

export interface FeaturesPageSettings extends WithId {
  page_title: string
  page_subtitle: string
  hero_badge: string
  hero_heading_line1: string
  hero_heading_line2: string
  hero_description: string
  hero_image_url: string
  primary_cta_text: string
  primary_cta_url: string
  secondary_cta_text: string
  secondary_cta_url: string
  trust_badge_text: string
  trusted_users_count: string
  features_grid_heading: string
  features_grid_subtitle: string
  is_active: boolean
}

export interface FeaturesPageCard extends WithId {
  title: string
  description: string
  icon: string
  image_url: string
  gradient: string
  cta_text: string
  cta_url: string
  display_order: number
  is_active: boolean
}

export interface FeaturesAnalyticsSection extends WithId {
  badge: string
  heading: string
  description: string
  dashboard_image_url: string
  cta_text: string
  cta_url: string
  is_active: boolean
}

export interface FeaturesShowcaseSection extends WithId {
  badge: string
  heading: string
  description: string
  main_image_url: string
  card_image_url: string
  is_active: boolean
}

export interface FeaturesCTA extends WithId {
  heading: string
  description: string
  button_text: string
  button_url: string
  background_image_url: string
  is_active: boolean
}

export interface PublicFeaturesPagePayload {
  page: FeaturesPageSettings
  cards: FeaturesPageCard[]
  analytics: FeaturesAnalyticsSection | null
  showcase: FeaturesShowcaseSection | null
  statistics: Statistic[]
  cta: FeaturesCTA | null
}

// ---------------------------------------------------------------------
// Contact messages
// ---------------------------------------------------------------------

export interface ContactMessageReply extends WithId {
  content: string
  admin_name: string | null
  created_at: string
}

export interface ContactMessage extends WithId {
  name: string
  email: string
  subject: string
  message: string
  is_read: boolean
  is_resolved: boolean
  created_at: string
  replies: ContactMessageReply[]
  reply_count: number
}

// ---------------------------------------------------------------------
// Public (combined) payloads — consumed by Phase 4, defined now since the
// read endpoints already exist on the backend.
// ---------------------------------------------------------------------

export interface PublicHomePayload {
  hero: Hero | null
  hero_features: HeroFeature[]
  bottom_bar: BottomBarItem[]
  how_it_feels: (HowItFeels & { points: HowItFeelsPoint[] }) | null
  companies: Company[]
  statistics: Statistic[]
  values: Value[]
  testimonials: Testimonial[]
  faqs_preview: Faq[]
  cta: Cta | null
}

export interface PublicAboutPayload {
  page: AboutPage
  story_features: AboutFeature[]
  mission: Mission | null
  why_choose: WhyChoose[]
  built_from_experience: BuiltFromExperience | null
  statistics: Statistic[]
  values: Value[]
}

// ---------------------------------------------------------------------
// General Settings (Admin Settings > General) — single source of truth
// for the public site's branding/contact info, currency and timezone.
// ---------------------------------------------------------------------

export interface GeneralSettings extends WithId {
  site_name: string
  site_email: string
  site_phone: string
  site_address: string
  currency: string
  timezone: string
  updated_at: string
}

// What the public website is allowed to read — no id/timestamps.
export type PublicGeneralSettings = Omit<GeneralSettings, "id" | "updated_at">

// ---------------------------------------------------------------------
// Payment / Shipping / Email / Security Settings — Admin Settings tabs.
// Real, database-backed singletons (see website_content.models.settings on
// the backend); `PaymentSettings.razorpay_secret` is write-only and never
// comes back from a GET — `has_secret` reports whether one is configured.
// ---------------------------------------------------------------------

export interface PaymentSettings extends WithId {
  razorpay_key_id: string
  razorpay_secret?: string
  has_secret: boolean
  cod_enabled: boolean
  updated_at: string
}

export interface ShippingSettings extends WithId {
  flat_rate: string
  free_shipping_threshold: string
  updated_at: string
}

export interface EmailSettings extends WithId {
  smtp_host: string
  smtp_port: number | null
  from_address: string
  updated_at: string
}

export interface SecuritySettings extends WithId {
  access_token_minutes: number
  min_password_length: number
  require_special_char: boolean
  updated_at: string
}
