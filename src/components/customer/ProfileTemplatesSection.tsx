import { Link } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check, Lock, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { PhoneMockup } from "@/components/marketing/ProfileThemeShowcase"
import { CARD_THEME_IDS, PROFILE_THEMES } from "@/data/constants"
import { cn } from "@/lib/utils"
import { ApiError, profileApi } from "@/lib/api"
import type { Profile } from "@/types"

// The 5 NEXORA Custom templates — the ones sold on /shop. Every customer
// sees all 5 as a preview regardless of purchase (see `unlocked` below for
// what purchase actually gates) — this id list itself isn't an entitlement
// check, just "which of the 9 registered themes this section shows".
const AVAILABLE_TEMPLATE_IDS = CARD_THEME_IDS.custom

interface ProfileTemplatesSectionProps {
  profile: Profile
  // Whether this customer has a real, non-cancelled order containing the
  // NEXORA Custom NFC card (card_type "CUSTOM") — see QrCode.tsx, which
  // derives this from the same orders data the Google Review Card section
  // already uses. Templates stay visible either way (so a customer can see
  // what they'd get before buying), but selecting one — the action that
  // actually updates the profile — is only wired up once this is true.
  unlocked: boolean
}

/**
 * Lets the customer pick the visual template their profile (and QR-scanned
 * public page) renders with. Shows all 5 existing NEXORA templates as a
 * preview to every customer, reusing the exact same theme metadata/mockups
 * as the /shop showcase so there's one visual source of truth for what each
 * template looks like — but only a customer who purchased NEXORA Custom
 * (`unlocked`) can actually select one.
 */
export function ProfileTemplatesSection({ profile, unlocked }: ProfileTemplatesSectionProps) {
  const queryClient = useQueryClient()
  const themes = PROFILE_THEMES.filter((t) => AVAILABLE_TEMPLATE_IDS.includes(t.id))

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
        <CardDescription>
          {unlocked ? (
            "Choose a profile template for your digital business profile."
          ) : (
            <>
              Purchase the NEXORA Custom NFC card to unlock and select one of these templates.{" "}
              <Link to="/shop" className="font-medium text-primary hover:underline">
                Order NEXORA Custom
              </Link>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "grid grid-cols-1 gap-5",
            themes.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : themes.length === 2 ? "sm:grid-cols-2" : "",
          )}
        >
          {themes.map((theme) => {
            const isSelected = unlocked && profile.selectedTemplate === theme.id
            const isSaving = mutation.isPending && mutation.variables === theme.id

            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => unlocked && !isSelected && mutation.mutate(theme.id)}
                disabled={!unlocked || mutation.isPending}
                aria-disabled={!unlocked}
                title={unlocked ? undefined : "Purchase NEXORA Custom to unlock profile templates"}
                className={cn(
                  "group relative flex flex-col items-center rounded-2xl border-2 p-5 text-center transition-all disabled:cursor-not-allowed",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-glow-primary"
                    : "border-border hover:border-primary/40 hover:shadow-sm",
                  !unlocked && "opacity-60 hover:border-border hover:shadow-none",
                )}
              >
                {isSelected && (
                  <span className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground shadow-sm">
                    <Check className="size-3" /> Selected
                  </span>
                )}
                {!unlocked && (
                  <span className="absolute right-3 top-3 z-10 flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Lock className="size-3" />
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
