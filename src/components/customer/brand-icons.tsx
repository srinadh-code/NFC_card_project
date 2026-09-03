import { Globe, Send, CodeXml, MessageCircle, type LucideIcon } from "lucide-react"
import type { SocialPlatform } from "@/types"

type IconProps = { className?: string }

/** Hand-built brand glyphs — this project's lucide-react build ships no branded
 * social-network icons, so each mark below is a minimal, recognizable
 * white-on-brand-color rendition (letterform or simple shape) rather than the
 * exact official artwork. */

function LinkedInGlyph({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 19H5v-9h3v9zM6.5 8.4A1.75 1.75 0 1 1 6.5 4.9a1.75 1.75 0 0 1 0 3.5zM19.5 19h-3v-4.7c0-1.4-.6-1.9-1.37-1.9-.8 0-1.5.5-1.75 1.1-.09.2-.08.5-.08.7V19h-3v-9h2.9v1.3a3.1 3.1 0 0 1 2.7-1.4c1.55 0 3.6.86 3.6 3.7V19z" />
    </svg>
  )
}

function FacebookGlyph({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.25-1.5 1.55-1.5H16.7V3.7C16.4 3.66 15.4 3.57 14.24 3.57c-2.4 0-4.05 1.47-4.05 4.16v2.16H7.5v3.1h2.69V21h3.31z" />
    </svg>
  )
}

function InstagramGlyph({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5.5" />
      <circle cx="12" cy="12" r="4.3" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function XGlyph({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M4 4l7.2 8.7L4.3 20h2.3l5.9-6.4 4.6 6.4H21l-7.5-9.1L20 4h-2.3l-5.5 5.9L7.6 4H4z" />
    </svg>
  )
}

function YouTubeGlyph({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M10 8.5l6 3.5-6 3.5v-7z" />
    </svg>
  )
}

interface BrandConfig {
  label: string
  icon: LucideIcon | ((props: IconProps) => React.JSX.Element)
  background: string
  iconClassName?: string
}

export const SOCIAL_BRAND: Record<SocialPlatform, BrandConfig> = {
  LinkedIn: { label: "LinkedIn", icon: LinkedInGlyph, background: "#0A66C2" },
  Instagram: {
    label: "Instagram",
    icon: InstagramGlyph,
    background: "radial-gradient(circle at 30% 110%, #FEDA75 0%, #FA7E1E 25%, #D62976 45%, #962FBF 65%, #4F5BD5 85%)",
  },
  Facebook: { label: "Facebook", icon: FacebookGlyph, background: "#1877F2" },
  WhatsApp: { label: "WhatsApp", icon: MessageCircle, background: "#25D366" },
  YouTube: { label: "YouTube", icon: YouTubeGlyph, background: "#FF0000" },
  Twitter: { label: "Twitter", icon: XGlyph, background: "#000000" },
  GitHub: { label: "GitHub", icon: CodeXml, background: "#181717" },
  Telegram: { label: "Telegram", icon: Send, background: "#229ED9", iconClassName: "-rotate-45" },
  Website: { label: "Website", icon: Globe, background: "#6C63FF" },
}
