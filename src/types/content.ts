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
  heading: string
  description: string
  primary_cta_text: string
  primary_cta_link: string
  secondary_cta_text: string
  secondary_cta_link: string
  hero_image_url: string | null
  is_active: boolean
}

export interface HeroFeature extends WithId {
  icon: string
  label: string
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

export type StatisticPage = "home" | "about"

export interface Statistic extends WithId {
  page: StatisticPage
  value: string
  label: string
  icon: string
  display_order: number
  is_active: boolean
}

// ---------------------------------------------------------------------
// Contact messages
// ---------------------------------------------------------------------

export interface ContactMessage extends WithId {
  name: string
  email: string
  subject: string
  message: string
  is_read: boolean
  is_resolved: boolean
  created_at: string
}

// ---------------------------------------------------------------------
// Public (combined) payloads — consumed by Phase 4, defined now since the
// read endpoints already exist on the backend.
// ---------------------------------------------------------------------

export interface PublicHomePayload {
  hero: Hero | null
  hero_features: HeroFeature[]
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
