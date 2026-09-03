import { AtSign, Briefcase, Camera, CodeXml, Globe, Link2, MessageCircle, PlaySquare, Send, Users } from "lucide-react"
import type { SocialLink } from "@/types"

// lucide-react (this project's installed version) does not ship branded
// social-network glyphs, so each platform maps to the closest generic icon.
export const SOCIAL_ICON_MAP: Record<SocialLink["platform"], typeof Link2> = {
  LinkedIn: Briefcase,
  Instagram: Camera,
  Facebook: Users,
  WhatsApp: MessageCircle,
  YouTube: PlaySquare,
  Twitter: AtSign,
  GitHub: CodeXml,
  Telegram: Send,
  Website: Globe,
}

export function getSocialIcon(platform: SocialLink["platform"]) {
  return SOCIAL_ICON_MAP[platform] ?? Link2
}
