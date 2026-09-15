import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { PhoneMockup } from "@/components/marketing/ProfileThemeShowcase"
import { CARD_THEME_IDS, PROFILE_THEMES } from "@/data/constants"
import { cn } from "@/lib/utils"
import { ApiError, profileApi } from "@/lib/api"
import type { Profile } from "@/types"

// All 5 existing NEXORA Custom templates — the ones sold on /shop — are
// now offered to every customer regardless of plan/entitlement. This was
// previously `profile.availableTemplates` (a server-resolved allow-list
// keyed to the customer's purchased plan: 1 for Classic, 3 for Premium, 5
// for Custom); that field is left alone/still comes from the API, it's
// just no longer read here, so template *availability* is a pure frontend
// choice again. Template *selection* still round-trips through the real
// API below — see the module comment there for what that means if the
// backend still enforces its own plan check server-side.
const AVAILABLE_TEMPLATE_IDS = CARD_THEME_IDS.custom

interface ProfileTemplatesSectionProps {
  profile: Profile
}

/**
 * Lets the customer pick the visual template their profile (and QR-scanned
 * public page) renders with. Shows all 5 existing NEXORA templates to every
 * customer (see `AVAILABLE_TEMPLATE_IDS` above), and reuses the exact same
 * theme metadata/mockups as the /shop showcase so there's one visual source
 * of truth for what each template looks like.
 */
export function ProfileTemplatesSection({ profile }: ProfileTemplatesSectionProps) {
  const queryClient = useQueryClient()
  const themes = PROFILE_THEMES.filter((t) => AVAILABLE_TEMPLATE_IDS.includes(t.id))
  const planCopy = "Choose any of these 5 templates for your digital business profile."

  const mutation = useMutation({
    mutationFn: (templateId: string) => profileApi.updateSelectedTemplate(templateId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["profile-me"], updated)
      toast.success("Profile template updated.")
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update your template. Please try again.")
    },
  })

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Profile Templates</CardTitle>
        <CardDescription>Choose a profile template for your digital business profile. {planCopy}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "grid grid-cols-1 gap-5",
            themes.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : themes.length === 2 ? "sm:grid-cols-2" : "",
          )}
        >
          {themes.map((theme) => {
            const isSelected = profile.selectedTemplate === theme.id
            const isSaving = mutation.isPending && mutation.variables === theme.id

            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => !isSelected && mutation.mutate(theme.id)}
                disabled={mutation.isPending}
                className={cn(
                  "group relative flex flex-col items-center rounded-2xl border-2 p-5 text-center transition-all disabled:cursor-not-allowed",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-glow-primary"
                    : "border-border hover:border-primary/40 hover:shadow-sm",
                )}
              >
                {isSelected && (
                  <span className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground shadow-sm">
                    <Check className="size-3" /> Selected
                  </span>
                )}
                {isSaving && (
                  <span className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70">
                    <Loader2 className="size-6 animate-spin text-primary" />
                  </span>
                )}

                <PhoneMockup theme={theme} />

                <p className="mt-4 text-sm font-bold text-foreground">{theme.name.replace("NEXORA ", "")}</p>
                <p className="text-xs text-muted-foreground">{theme.tagline}</p>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
