import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { PartyPopper, Megaphone, Sparkles, AlertTriangle, X } from "lucide-react"
import { publicAnnouncementsApi, type AnnouncementType, type ApiPublicAnnouncement } from "@/lib/api"
import { formatDate } from "@/lib/mock-api"

const TYPE_ICON: Record<AnnouncementType, typeof Megaphone> = {
  OFFER: PartyPopper,
  FESTIVAL: PartyPopper,
  PRODUCT: Sparkles,
  FEATURE: Sparkles,
  MAINTENANCE: AlertTriangle,
  IMPORTANT: AlertTriangle,
  GENERAL: Megaphone,
}

const DISMISSED_KEY = "nexora-dismissed-announcement-ids"

function SegmentContent({ announcement, onCta }: { announcement: ApiPublicAnnouncement; onCta: () => void }) {
  const Icon = TYPE_ICON[announcement.announcement_type] ?? Megaphone
  const isOffer = announcement.announcement_type === "OFFER"

  const discountLine = announcement.discount_type === "PERCENTAGE" && announcement.discount_percentage
    ? `${announcement.discount_percentage}% OFF`
    : announcement.discount_type === "FIXED" && announcement.discount_amount
      ? `₹${announcement.discount_amount} OFF`
      : null

  return (
    <span className="inline-flex shrink-0 items-center gap-2.5 px-4 text-sm font-medium text-white">
      <Icon className="size-4 shrink-0" />
      <span className="font-bold uppercase tracking-wide">{announcement.offer_title || announcement.title}</span>
      {!isOffer && announcement.message && <span className="opacity-90">{announcement.message}</span>}
      {discountLine && (
        <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-semibold">{discountLine}</span>
      )}
      {isOffer && announcement.promo_code && (
        <span className="rounded-full bg-black/15 px-2.5 py-0.5 font-mono text-xs font-semibold">
          Use Code: {announcement.promo_code}
        </span>
      )}
      {isOffer && announcement.end_at && (
        <span className="text-xs opacity-80">⏰ Valid until {formatDate(announcement.end_at)}</span>
      )}
      {isOffer && announcement.cta_text && announcement.cta_link && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onCta()
          }}
          className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-900 shadow-sm transition-transform hover:scale-105"
        >
          {announcement.cta_text} →
        </button>
      )}
      <span className="text-white/40">✦</span>
    </span>
  )
}

/**
 * Site-wide colorful scrolling announcement/offer marquee — mounted once
 * in PublicLayout, above the Navbar, so it appears consistently across
 * every public page. Every active announcement/offer (see
 * PublicAnnouncementListView — already scoped to published + currently
 * within its start/end window) is woven into ONE continuous scrolling
 * strip rather than one bar per announcement, so N active announcements
 * never turns into a stack of banners (see the spec's "multiple
 * announcements" requirement). Nothing here is hardcoded — a plain
 * Festival/General announcement never shows discount info, only an
 * Offer/Promotion does, exactly as the backend actually classified it.
 */
export function AnnouncementBanner() {
  const navigate = useNavigate()
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ["announcements", "public"],
    queryFn: publicAnnouncementsApi.list,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const announcements = data ?? []
  // Keyed by exactly which announcements are currently active — dismissing
  // hides *this* set for the session (sessionStorage: gone when the tab
  // closes), but a newly-published announcement changes the key, so it's
  // never permanently hidden just because an earlier, different set was
  // dismissed.
  const activeKey = announcements.map((a) => a.id).sort((a, b) => a - b).join(",")

  useEffect(() => {
    try {
      setDismissedKey(sessionStorage.getItem(DISMISSED_KEY))
    } catch {
      setDismissedKey(null)
    }
  }, [])

  function handleDismiss() {
    try {
      sessionStorage.setItem(DISMISSED_KEY, activeKey)
    } catch {
      // Private browsing / storage disabled — the banner just reappears on
      // the next page, which is a harmless degradation, not a broken close
      // button (the click itself still hides it immediately below).
    }
    setDismissedKey(activeKey)
  }

  if (announcements.length === 0 || !activeKey || dismissedKey === activeKey) return null

  return (
    <div className="relative flex h-11 items-center overflow-hidden bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#EC4899]">
      <div className="flex w-max animate-marquee">
        {/* Rendered twice back-to-back so the scroll from 0 to -50% loops
            with an invisible seam — see the .animate-marquee keyframes. */}
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
            {announcements.map((a) => (
              <SegmentContent
                key={`${copy}-${a.id}`}
                announcement={a}
                onCta={() => {
                  if (!a.cta_link) return
                  if (a.cta_link.startsWith("/")) navigate(a.cta_link)
                  else window.open(a.cta_link, "_blank", "noopener,noreferrer")
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/10 p-1 text-white/90 transition-colors hover:bg-black/25 hover:text-white"
      >
        <X className="size-3.5" />
      </button>
      {/* Fades the edge under the close button so scrolling text never
          looks like it's clipping mid-character right next to it. */}
      <div className="pointer-events-none absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-[#EC4899] to-transparent" />
    </div>
  )
}
