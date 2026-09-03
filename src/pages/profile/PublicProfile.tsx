import { useEffect, useMemo, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { toast } from "sonner"
import QRCode from "qrcode"
import { Download, Lock, Mail, MessageCircle, Phone, Share2, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDataStore, selectProfileByUsername } from "@/store/data-store"
import { useCustomerSettingsStore } from "@/store/customer-settings-store"
import { getSocialIcon } from "@/components/customer/social-icons"
import type { CustomLink, Profile, SocialLink } from "@/types"

function digitsOnly(phone: string) {
  return phone.replace(/[^0-9]/g, "")
}

function buildVCard(profile: Profile, includeContact: boolean) {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${profile.fullName}`, `ORG:${profile.company}`, `TITLE:${profile.designation}`]

  if (includeContact) {
    if (profile.phone) lines.push(`TEL;TYPE=CELL:${profile.phone}`)
    if (profile.email) lines.push(`EMAIL:${profile.email}`)
  }
  if (profile.address) lines.push(`ADR;TYPE=WORK:;;${profile.address}`)
  if (profile.website) lines.push(`URL:${profile.website}`)

  profile.customLinks
    .filter((l) => l.enabled)
    .sort((a, b) => a.order - b.order)
    .forEach((l) => lines.push(`URL:${l.url}`))

  if (profile.customFields.length > 0) {
    const note = profile.customFields.map((f) => `${f.label}: ${f.value}`).join(" | ")
    lines.push(`NOTE:${note}`)
  }

  lines.push("END:VCARD")
  return lines.join("\n")
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
          <Link to="/">Go to TapLink Home</Link>
        </Button>
      </div>
    </div>
  )
}

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>()
  const profile = useDataStore(selectProfileByUsername(username ?? ""))
  const profilePublic = useCustomerSettingsStore((s) => s.profilePublic)
  const showContactInfo = useCustomerSettingsStore((s) => s.showContactInfo)

  const currentUrl = typeof window !== "undefined" ? window.location.href : ""
  const [qrDataUrl, setQrDataUrl] = useState("")

  useEffect(() => {
    if (!currentUrl) return
    let cancelled = false
    QRCode.toDataURL(currentUrl, { width: 200, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [currentUrl])

  const links = useMemo(() => {
    if (!profile) return [] as { key: string; label: string; href: string; icon: ReturnType<typeof getSocialIcon> }[]
    const social = profile.socialLinks
      .filter((l): l is SocialLink => l.enabled)
      .sort((a, b) => a.order - b.order)
      .map((l) => ({ key: `social-${l.platform}`, label: l.platform, href: l.url, icon: getSocialIcon(l.platform) }))
    const custom = profile.customLinks
      .filter((l): l is CustomLink => l.enabled)
      .sort((a, b) => a.order - b.order)
      .map((l) => ({ key: `custom-${l.id}`, label: l.label, href: l.url, icon: getSocialIcon("Website") }))
    return [...social, ...custom]
  }, [profile])

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

  const initials = profile.fullName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  function handleSaveContact() {
    const vcard = buildVCard(profile!, showContactInfo)
    const blob = new Blob([vcard], { type: "text/vcard" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${profile!.username}.vcf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success("Contact saved.")
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
            <span className="font-bold tracking-tight">TapLink</span>
          </Link>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-xl">
          <div className="h-28 bg-gradient-brand-br" />
          <div className="-mt-14 flex flex-col items-center px-6 pb-8">
            <img
              src={profile.avatar}
              alt={profile.fullName}
              className="size-28 rounded-full border-4 border-card object-cover shadow-md"
            />
            <h1 className="mt-3 text-xl font-bold">{profile.fullName}</h1>
            <p className="text-sm text-muted-foreground">{profile.designation}</p>
            <p className="text-sm font-medium text-primary">{profile.company}</p>
            {profile.bio && <p className="mt-3 max-w-sm text-center text-sm text-muted-foreground">{profile.bio}</p>}

            {profile.customFields.length > 0 && (
              <div className="mt-5 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {profile.customFields
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((field) => (
                    <div key={field.id} className="rounded-xl border bg-muted/40 px-3 py-2 text-left">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {field.label || "Untitled"}
                      </p>
                      <p className="truncate text-sm font-medium" title={field.value}>
                        {field.value || "—"}
                      </p>
                    </div>
                  ))}
              </div>
            )}

            {showContactInfo && (
              <div className="mt-5 grid w-full grid-cols-3 gap-2">
                <Button asChild variant="outline" size="sm" className="flex-col gap-1 h-auto py-2.5">
                  <a href={`tel:${profile.phone}`}>
                    <Phone className="size-4" />
                    <span className="text-xs">Call</span>
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm" className="flex-col gap-1 h-auto py-2.5">
                  <a href={`mailto:${profile.email}`}>
                    <Mail className="size-4" />
                    <span className="text-xs">Email</span>
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm" className="flex-col gap-1 h-auto py-2.5">
                  <a href={`https://wa.me/${digitsOnly(profile.phone)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="size-4" />
                    <span className="text-xs">WhatsApp</span>
                  </a>
                </Button>
              </div>
            )}

            <div className="mt-3 grid w-full grid-cols-2 gap-2">
              <Button onClick={handleSaveContact}>
                <Download /> Save Contact
              </Button>
              <Button variant="outline" onClick={handleShare}>
                <Share2 /> Share
              </Button>
            </div>

            {links.length > 0 && (
              <div className="mt-6 flex w-full flex-wrap justify-center gap-2 border-t pt-6">
                {links.map((link) => {
                  const Icon = link.icon
                  return (
                    <a
                      key={link.key}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                      title={link.label}
                    >
                      <Icon className="size-3.5" />
                      {link.label}
                    </a>
                  )
                })}
              </div>
            )}

            <div className="mt-6 flex flex-col items-center gap-2 border-t pt-6">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Scan to share this profile" width={160} height={160} className="rounded-lg" />
              ) : (
                <div className="size-40 animate-pulse rounded-lg bg-muted" />
              )}
              <p className="text-xs text-muted-foreground">Scan to share this profile</p>
            </div>
          </div>
        </div>

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
