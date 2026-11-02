import { useEffect, useRef } from "react"
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Lock, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemedDigitalCardPreview } from "@/components/customer/profile-templates"
import { analyticsApi, profileApi } from "@/lib/api"
import type { Profile, SocialPlatform } from "@/types"

const normalizeHref = (href: string) => href.trim().replace(/\/+$/, "").toLowerCase()

/** Which of the owner's social platforms a clicked link belongs to, or null
 * for anything else (phone, email, website field, maps...). Every template
 * renders social links straight from `profile.socialLinks`, plus a WhatsApp
 * contact button built from the phone number (wa.me). */
function socialPlatformFor(rawHref: string, profile: Profile): SocialPlatform | null {
  const href = normalizeHref(rawHref)
  const link = profile.socialLinks.find((l) => l.enabled && l.url.trim() && normalizeHref(l.url) === href)
  if (link) return link.platform
  if (href.startsWith("https://wa.me/")) return "WhatsApp"
  return null
}

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
          <Link to="/">Go to VR's GATEWAY Home</Link>
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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // A QR code opens /u/<username>?src=qr. That marker is sent with the
  // first profile load only (the backend records the scan) and then removed
  // from the address bar, so a refresh, a re-render or a shared copy of
  // this URL is never counted as another scan.
  const pendingQrScan = useRef<"qr" | undefined>(searchParams.get("src") === "qr" ? "qr" : undefined)
  useEffect(() => {
    if (!searchParams.has("src")) return
    const next = new URLSearchParams(searchParams)
    next.delete("src")
    navigate({ search: next.toString() ? `?${next}` : "" }, { replace: true })
  }, [searchParams, navigate])

  const { data: profile, isLoading } = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => {
      const src = pendingQrScan.current
      pendingQrScan.current = undefined
      return profileApi.getPublic(username ?? "", src)
    },
    enabled: Boolean(username),
  })

  // One listener around the whole card (instead of one per template) for
  // visitor clicks on social links. Same-link repeats within a second (a
  // double-click) count once; the link itself opens normally.
  const lastSocialClick = useRef({ href: "", at: 0 })
  function handleCardClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!profile || (e.type === "auxclick" && e.button !== 1)) return
    const anchor = (e.target as HTMLElement).closest("a[href]")
    const rawHref = anchor?.getAttribute("href")
    if (!rawHref) return
    const platform = socialPlatformFor(rawHref, profile)
    if (!platform) return
    const now = Date.now()
    if (lastSocialClick.current.href === rawHref && now - lastSocialClick.current.at < 1000) return
    lastSocialClick.current = { href: rawHref, at: now }
    analyticsApi.trackSocialClick(profile.username, platform)
  }

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
      <div className="mx-auto max-w-md" onClick={handleCardClick} onAuxClick={handleCardClick}>
        <div className="flex justify-center pb-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="size-4" fill="currentColor" />
            </div>
            <span className="font-bold tracking-tight">VR's GATEWAY</span>
          </Link>
        </div>

        <ThemedDigitalCardPreview
          profile={profile}
          onShare={handleShare}
          showContactInfo={Boolean(profile.email || profile.phone)}
          enquiryEnabled
        />

        <p className="pt-6 text-center text-xs text-muted-foreground">
          Powered by{" "}
          <Link to="/" className="font-medium text-primary hover:underline">
            VR's GATEWAY
          </Link>
        </p>
      </div>
    </div>
  )
}
