import { DigitalCardPreview } from "@/components/customer/DigitalCardPreview"
import type { Profile } from "@/types"
import CreativeTemplate from "./CreativeTemplate"
import ExecutiveTemplate from "./ExecutiveTemplate"
import FutureTemplate from "./FutureTemplate"
import GlassTemplate from "./GlassTemplate"
import ImpactTemplate from "./ImpactTemplate"
import LuxuryTemplate from "./LuxuryTemplate"
import NatureTemplate from "./NatureTemplate"
import SignatureTemplate from "./SignatureTemplate"
import type { TemplateProps } from "./shared"

// Template id -> renderer. "classic" reuses the pre-existing
// DigitalCardPreview unchanged (it *is* the Classic design) rather than a
// re-implementation, per the "reuse existing rendering logic" requirement.
// Keys match common.templates.PLAN_TEMPLATES on the backend and
// PROFILE_THEMES/CARD_THEME_IDS in @/data/constants.ts on the frontend —
// one shared id space across plan entitlement, /shop, and this renderer.
export const PROFILE_TEMPLATE_COMPONENTS: Record<string, React.ComponentType<TemplateProps>> = {
  classic: DigitalCardPreview,
  signature: SignatureTemplate,
  creative: CreativeTemplate,
  executive: ExecutiveTemplate,
  luxury: LuxuryTemplate,
  future: FutureTemplate,
  nature: NatureTemplate,
  glass: GlassTemplate,
  impact: ImpactTemplate,
}

interface ThemedDigitalCardPreviewProps {
  profile: Profile
  onShare: () => void
  showContactInfo?: boolean
}

/** Renders the profile using whichever template the customer selected
 * (`profile.selectedTemplate`), falling back to Classic for an unrecognized
 * or missing id. Used by both the /qr-code live preview and the public
 * profile page, so selecting a template changes both from one save. */
export function ThemedDigitalCardPreview({ profile, onShare, showContactInfo }: ThemedDigitalCardPreviewProps) {
  const Template = PROFILE_TEMPLATE_COMPONENTS[profile.selectedTemplate] ?? DigitalCardPreview
  return <Template profile={profile} onShare={onShare} showContactInfo={showContactInfo} />
}
