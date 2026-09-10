import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { PhoneMockup } from "@/components/marketing/ProfileThemeShowcase"
import { PROFILE_THEMES } from "@/data/constants"
import { cn } from "@/lib/utils"
import { ApiError, profileApi } from "@/lib/api"
import type { Profile } from "@/types"

const PLAN_COPY: Record<string, string> = {
  classic: "1 template included with your Classic plan.",
  premium: "Choose 1 of 3 templates included with your Premium plan.",
  custom: "Choose 1 of 5 templates included with your Custom plan.",
}

interface ProfileTemplatesSectionProps {
  profile: Profile
}

/**
 * Lets the customer pick the visual template their profile (and QR-scanned
 * public page) renders with. Only ever shows the templates their purchased
 * plan actually entitles them to (`profile.availableTemplates`, resolved
 * server-side from their paid orders — never trusted from the client), and
 * reuses the exact same theme metadata/mockups as the /shop showcase so
 * there's one visual source of truth for what each template looks like.
 */
export function ProfileTemplatesSection({ profile }: ProfileTemplatesSectionProps) {
  const queryClient = useQueryClient()
  const availableIds = profile.availableTemplates ?? ["classic"]
  const themes = PROFILE_THEMES.filter((t) => availableIds.includes(t.id))
  const planCopy = PLAN_COPY[profile.plan ?? "classic"] ?? `${availableIds.length} template(s) included with your plan.`

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
