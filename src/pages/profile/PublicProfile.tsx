import { useParams, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Lock, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemedDigitalCardPreview } from "@/components/customer/profile-templates"
import { profileApi } from "@/lib/api"

function EmptyShell({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#EEF2FF] via-white to-[#FDF2F8] p-6">
      <div className="max-w-sm space-y-4 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {title === "This profile is private" ? (
            <Lock className="size-7" />
          ) : (
            <Zap className="size-7" fill="currentColor" />
          )}
        </div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        <Button asChild>
          <Link to="/">Go to VR's NEXORA Home</Link>
        </Button>
      </div>
    </div>
  )
}

/**
 * The public, scannable version of a customer's digital card. Fetches the
 * real backend's public profile endpoint, which already filters out
 * disabled links and strips contact info per the owner's own privacy
 * settings — this page just renders whatever it gets back.
 */
export default function PublicProfile() {
  const { username } = useParams<{ username: string }>()

  const { data: profile, isLoading } = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => profileApi.getPublic(username ?? ""),
    enabled: Boolean(username),
  })

  const currentUrl = typeof window !== "undefined" ? window.location.href : ""

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#EEF2FF] via-white to-[#FDF2F8] p-6">
        <Skeleton className="h-[560px] w-[300px] rounded-[36px]" />
      </div>
    )
  }

  if (!profile) {
    return (
      <EmptyShell
        title="This profile doesn't exist"
        description="The card you scanned may have expired, the link is incorrect, or the owner has made it private."
      />
    )
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: profile!.fullName, url: currentUrl })
      } catch {
        // user cancelled share sheet — no-op
      }
      return
    }
    try {
      await navigator.clipboard.writeText(currentUrl)
      toast.success("Profile link copied to clipboard.")
    } catch {
      toast.error("Couldn't copy the link. Please copy it manually.")
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EEF2FF] via-white to-[#FDF2F8] px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="flex justify-center pb-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="size-4" fill="currentColor" />
            </div>
            <span className="font-bold tracking-tight">VR's NEXORA</span>
          </Link>
        </div>

        <ThemedDigitalCardPreview
          profile={profile}
          onShare={handleShare}
          showContactInfo={Boolean(profile.email || profile.phone)}
        />

        <p className="pt-6 text-center text-xs text-muted-foreground">
          Powered by{" "}
          <Link to="/" className="font-medium text-primary hover:underline">
            VR's NEXORA
          </Link>
        </p>
      </div>
    </div>
  )
}
