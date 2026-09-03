import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { toast } from "sonner"
import QRCode from "qrcode"
import { Lock, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DigitalCardPreview } from "@/components/customer/DigitalCardPreview"
import { useDataStore, selectProfileByUsername } from "@/store/data-store"
import { useCustomerSettingsStore } from "@/store/customer-settings-store"
import { downloadQrPng } from "@/components/customer/qr-utils"

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
          <Link to="/">Go to TapLink Home</Link>
        </Button>
      </div>
    </div>
  )
}

/**
 * The public, scannable version of a customer's digital card. This renders
 * the exact same <DigitalCardPreview> component the customer sees in their
 * own QR Code dashboard page (src/pages/customer/QrCode.tsx) against the
 * exact same `profiles` record (selected by username here, by customerId
 * there) — one rendering path, one data source, so the two can never drift
 * out of sync with each other.
 */
export default function PublicProfile() {
  const { username } = useParams<{ username: string }>()
  const profile = useDataStore(selectProfileByUsername(username ?? ""))
  const profilePublic = useCustomerSettingsStore((s) => s.profilePublic)
  const showContactInfo = useCustomerSettingsStore((s) => s.showContactInfo)

  const currentUrl = typeof window !== "undefined" ? window.location.href : ""
  const [qrDataUrl, setQrDataUrl] = useState("")
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!currentUrl) return
    let cancelled = false
    QRCode.toDataURL(currentUrl, { width: 320, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [currentUrl])

  if (!profile) {
    return (
      <EmptyShell
        title="This profile doesn't exist"
        description="The card you scanned may have expired, or the link is incorrect."
      />
    )
  }

  if (!profilePublic) {
    return (
      <EmptyShell
        title="This profile is private"
        description={`${profile.fullName} has made this card private. Ask them to enable public visibility in Settings.`}
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

  async function handleDownloadQr() {
    setDownloading(true)
    try {
      await downloadQrPng(currentUrl, `${profile!.username}-qr-code.png`)
      toast.success("QR code downloaded.")
    } catch {
      toast.error("Couldn't generate the QR code right now.")
    } finally {
      setDownloading(false)
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
            <span className="font-bold tracking-tight">TapLink</span>
          </Link>
        </div>

        <DigitalCardPreview
          profile={profile}
          qrDataUrl={qrDataUrl}
          downloading={downloading}
          onDownloadQr={handleDownloadQr}
          onShare={handleShare}
          showContactInfo={showContactInfo}
        />

        <p className="pt-6 text-center text-xs text-muted-foreground">
          Powered by{" "}
          <Link to="/" className="font-medium text-primary hover:underline">
            TapLink
          </Link>
        </p>
      </div>
    </div>
  )
}
