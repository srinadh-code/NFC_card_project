import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Mail,
  MapPin,
  MousePointerClick,
  Nfc,
  Eye,
  PackageSearch,
  Phone,
  QrCode,
  BookmarkCheck,
  Share2,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { StatCard } from "@/components/customer/StatCard"
import { ErrorState } from "@/components/customer/ErrorState"
import { NfcCardFace } from "@/components/marketing/NfcCardShowcase"
import { useCustomerAuthStore } from "@/store/auth-store"
import { useEnsuredProfile } from "@/hooks/use-ensured-profile"
import { formatDate } from "@/lib/mock-api"
import { orderStatusLabel } from "@/lib/order-status"
import { downloadQrPng, shareOrCopyLink } from "@/components/customer/qr-utils"
<<<<<<< HEAD
import { analyticsApi, nfcApi, ordersApi } from "@/lib/api"

const IN_PROGRESS_ORDER_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "PRINTED", "SHIPPED"]
=======
import { nfcApi, customerOrderApi, customerAnalyticsApi } from "@/lib/api"
>>>>>>> b82680aac13f3627b3ea99a2417041dd3442cc04

// Known demo UIDs seeded by `python manage.py seed_demo_cards` on the
// backend — used only to prefill the manual-entry/"simulate scan" demo
// helpers below, since a customer has no API to browse all unassigned
// cards (correctly — that's admin-only).
const DEMO_UNASSIGNED_UID = "04AABBCC0001"

function InfoRow({ icon: Icon, label, value, mono }: { icon: typeof Mail; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/30 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className={`truncate text-sm font-semibold text-foreground ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
    </div>
  )
}

export default function CustomerMyCard() {
  const customer = useCustomerAuthStore((s) => s.customer)
  const { profile } = useEnsuredProfile()
  const queryClient = useQueryClient()

  const cardsQuery = useQuery({
    queryKey: ["nfc-cards-mine"],
    queryFn: nfcApi.mine,
    enabled: Boolean(customer),
  })
  const cards = cardsQuery.data ?? []

  const ordersQuery = useQuery({
    queryKey: ["customer-orders", 1],
    queryFn: () => ordersApi.list(1),
    enabled: Boolean(customer),
  })

  const summaryQuery = useQuery({
    queryKey: ["customer-analytics-summary"],
    queryFn: analyticsApi.getSummary,
    enabled: Boolean(customer),
  })

  const { data: orders = [] } = useQuery({
    queryKey: ["customer-orders", customer?.id],
    queryFn: customerOrderApi.mine,
    enabled: Boolean(customer),
  })

  // Only fetched for the "assigned but not yet activated" state below, but
  // called unconditionally here since hooks can't run inside a branch.
  const { data: analyticsSummary } = useQuery({
    queryKey: ["customer-analytics-summary", customer?.id],
    queryFn: customerAnalyticsApi.summary,
    enabled: Boolean(customer),
  })

  const activeCard = cards.find((c) => c.status === "Active") ?? null
  const assignedCard = cards.find((c) => c.status === "Assigned") ?? null
  const processingOrder =
    (ordersQuery.data?.items ?? [])
      .filter((o) => IN_PROGRESS_ORDER_STATUSES.includes(o.status))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null

  const [uid, setUid] = useState("")
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const mutation = useMutation({
    mutationFn: (cardUid: string) => nfcApi.activate(cardUid),
    onSuccess: () => {
      toast.success("Card activated successfully!")
      setUid("")
      queryClient.invalidateQueries({ queryKey: ["nfc-cards-mine"] })
    },
    onError: () => {
      toast.error("We couldn't find a card with that ID. Please check and try again.")
    },
  })

  const activateAssignedMutation = useMutation({
    mutationFn: (cardId: string) => nfcApi.activateAssigned(cardId),
    onSuccess: () => {
      toast.success("Card activated successfully! Your profile is now live.")
      queryClient.invalidateQueries({ queryKey: ["nfc-cards-mine"] })
    },
    onError: () => toast.error("Something went wrong activating your card. Please try again."),
  })

  const deactivateMutation = useMutation({
    mutationFn: (cardUid: string) => nfcApi.deactivate(cardUid),
    onSuccess: () => {
      toast.success("Card deactivated.")
      queryClient.invalidateQueries({ queryKey: ["nfc-cards-mine"] })
    },
    onError: () => toast.error("Something went wrong deactivating your card. Please try again."),
  })

  function handleUseDemoCard() {
    setUid(DEMO_UNASSIGNED_UID)
    toast.success("Demo card ID filled in. Click Activate Card to continue.")
  }

  function handleSimulateScan() {
    mutation.mutate(DEMO_UNASSIGNED_UID)
  }

  function handleActivate(e: React.FormEvent) {
    e.preventDefault()
    if (!uid.trim()) {
      toast.error("Please enter a card ID or serial number.")
      return
    }
    mutation.mutate(uid.trim())
  }

  const profileUrl = profile ? `${window.location.origin}/u/${profile.username}` : ""

  function handleViewProfile() {
    if (!profileUrl) return
    window.open(profileUrl, "_blank", "noopener,noreferrer")
  }

  async function handleShareProfile() {
    if (!profileUrl || !profile) return
    const result = await shareOrCopyLink(profileUrl, `${profile.fullName} — VR's NEXORA`)
    if (result === "shared") toast.success("Shared!")
    else if (result === "copied") toast.success("Sharing isn't supported here — link copied instead!")
    else if (result === "failed") toast.error("Couldn't share or copy the link.")
  }

  async function handleDownloadQr() {
    if (!profileUrl || !profile) return
    setDownloading(true)
    try {
      await downloadQrPng(profileUrl, `${profile.username}-qr-code.png`)
      toast.success("QR code downloaded.")
    } catch {
      toast.error("Couldn't generate the QR code right now.")
    } finally {
      setDownloading(false)
    }
  }

  if (!customer) return null

  if (cardsQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  if (cardsQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState error={cardsQuery.error} onRetry={() => cardsQuery.refetch()} />
      </div>
    )
  }

  if (activeCard) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Alert variant="success" className="rounded-xl">
          <CheckCircle2 />
          <AlertTitle>Card is Active</AlertTitle>
          <AlertDescription>Your NFC card is linked to your profile and ready to share.</AlertDescription>
        </Alert>

        {/* Premium NFC card visual */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-950 p-6 text-white shadow-xl">
          <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-10 size-48 rounded-full bg-white/10 blur-2xl" />

          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Wifi className="size-6 -rotate-90" strokeWidth={2.5} />
              <span className="text-lg font-bold tracking-wide">VR's NEXORA</span>
            </div>
            <Badge className="border-white/30 bg-white/15 text-white backdrop-blur">{activeCard.status}</Badge>
          </div>

          {/* Chip accent */}
          <div className="relative mt-8 h-9 w-12 rounded-md bg-gradient-to-br from-yellow-200 via-yellow-300 to-yellow-500 shadow-inner">
            <div className="absolute inset-1 rounded-sm border border-yellow-600/30" />
            <div className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-yellow-600/40" />
            <div className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-yellow-600/40" />
          </div>

          <div className="relative mt-6 space-y-1">
            <p className="font-mono text-sm tracking-[0.2em] text-white/80">{activeCard.uid}</p>
            <p className="text-xl font-semibold">{customer.name}</p>
            <p className="text-sm text-white/70">
              {activeCard.cardType} · {activeCard.color}
            </p>
          </div>

          <Nfc className="absolute bottom-5 right-5 size-9 text-white/50" />
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Card Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Card UID</p>
              <p className="font-mono text-sm font-medium">{activeCard.uid}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Serial Number</p>
              <p className="font-mono text-sm font-medium">{activeCard.serialNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Card Type</p>
              <p className="text-sm font-medium">{activeCard.cardType}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant="success">{activeCard.status}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Activation Date</p>
              <p className="text-sm font-medium">
                {activeCard.activatedOn ? formatDate(activeCard.activatedOn) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Profile Status</p>
              <Badge variant="success">Live</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleViewProfile} disabled={!profile}>
            <ExternalLink /> View Profile
          </Button>
          <Button variant="outline" onClick={handleShareProfile} disabled={!profile}>
            <Share2 /> Share Profile
          </Button>
          <Button variant="soft" onClick={handleDownloadQr} disabled={!profile || downloading}>
            <Download /> {downloading ? "Preparing…" : "Download QR"}
          </Button>
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => deactivateMutation.mutate(activeCard.uid)}
            disabled={deactivateMutation.isPending}
          >
            {deactivateMutation.isPending ? "Deactivating…" : "Deactivate Card"}
          </Button>
        </div>
      </div>
    )
  }

  // A card has already been assigned by admin but the customer hasn't
  // tapped "Activate" yet — no need to type/guess a UID, it's right here.
  if (assignedCard) {
<<<<<<< HEAD
    const totals = summaryQuery.data?.totals
=======
    const totals = {
      taps: analyticsSummary?.totals.nfcTaps ?? 0,
      profileViews: analyticsSummary?.totals.profileViews ?? 0,
      qrScans: analyticsSummary?.totals.qrScans ?? 0,
      // No customer-facing "contact saved" event exists yet (that action is
      // only tracked in an internal table with no customer API) — 0 until
      // that's wired up, rather than mislabeling social-link clicks as this.
      shares: 0,
    }
>>>>>>> b82680aac13f3627b3ea99a2417041dd3442cc04
    const displayName = profile?.fullName ?? customer.name
    const displayAvatar = profile?.avatar ?? customer.avatar
    const displayEmail = profile?.email ?? customer.email

    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Status banner */}
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-brand-br p-6 text-white shadow-glow-primary-lg sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/4 size-56 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                <CheckCircle2 className="size-6" />
              </span>
              <div>
                <p className="text-lg font-bold sm:text-xl">Your NFC card is ready for activation</p>
                <p className="text-sm text-white/75">
                  Link it to your profile now and start sharing with a single tap.
                </p>
              </div>
            </div>
            <Button
              size="lg"
              onClick={() => activateAssignedMutation.mutate(assignedCard.id)}
              disabled={activateAssignedMutation.isPending}
              className="shrink-0 bg-white text-[#4F46E5] shadow-[0_10px_30px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-[0_15px_35px_rgba(0,0,0,0.28)]"
            >
              <Zap /> {activateAssignedMutation.isPending ? "Activating..." : "Activate Now"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Card preview */}
          <div className="flex items-center justify-center overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0B0F1A] via-[#12142B] to-[#1A0F2E] p-8 shadow-xl sm:p-10 lg:col-span-2">
            <div className="relative h-[190px] w-full max-w-xs sm:h-[210px]">
              <div className="h-full w-full -rotate-3 animate-float-slow transition-transform duration-500 ease-out hover:-rotate-1 hover:scale-[1.04]">
                <NfcCardFace tone="gold" />
              </div>
            </div>
          </div>

          {/* Profile info */}
          <Card className="rounded-[24px] lg:col-span-3">
            <CardContent className="space-y-5 pt-6">
              <div className="flex flex-wrap items-center gap-4">
                <img
                  src={displayAvatar}
                  alt={displayName}
                  className="size-16 rounded-full border-4 border-white object-cover shadow-md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-foreground">{displayName}</p>
                  {profile?.designation && <p className="text-sm text-muted-foreground">{profile.designation}</p>}
                  {profile?.company && <p className="text-sm text-muted-foreground">{profile.company}</p>}
                </div>
                <StatusBadge status={assignedCard.status} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {displayEmail && <InfoRow icon={Mail} label="Email" value={displayEmail} />}
                {profile?.phone && <InfoRow icon={Phone} label="Phone" value={profile.phone} />}
                {profile?.address && <InfoRow icon={MapPin} label="Location" value={profile.address} />}
                <InfoRow icon={Nfc} label="Card UID" value={assignedCard.uid} mono />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Total Taps"
            value={totals ? totals.nfc_taps.toLocaleString("en-IN") : 0}
            icon={MousePointerClick}
            loading={summaryQuery.isLoading}
          />
          <StatCard
            label="Profile Views"
            value={totals ? totals.profile_views.toLocaleString("en-IN") : 0}
            icon={Eye}
            loading={summaryQuery.isLoading}
          />
          <StatCard
            label="QR Scans"
            value={totals ? totals.qr_scans.toLocaleString("en-IN") : 0}
            icon={QrCode}
            loading={summaryQuery.isLoading}
          />
          <StatCard
            label="Social Clicks"
            value={totals ? totals.social_clicks.toLocaleString("en-IN") : 0}
            icon={BookmarkCheck}
            loading={summaryQuery.isLoading}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {processingOrder ? (
        <>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Your Order Is On Its Way</h1>
            <p className="text-sm text-muted-foreground">
              We'll assign your NFC card here as soon as it ships.
            </p>
          </div>
          <Card className="rounded-2xl">
            <CardContent className="flex items-center gap-4 py-6">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Clock className="size-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Order {processingOrder.order_number} is being processed</p>
                <p className="text-sm text-muted-foreground">
                  Placed on {formatDate(processingOrder.created_at)} · Status:{" "}
                  <StatusBadge status={orderStatusLabel(processingOrder.status)} className="ml-1" />
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/orders">Track Order</Link>
              </Button>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">No NFC Card Assigned Yet</h1>
          <p className="text-sm text-muted-foreground">
            Order your VR's NEXORA card to get started, or activate one below if you already have one.
          </p>
          <Button asChild className="mt-2">
            <Link to="/shop">
              <PackageSearch /> Order Your Card
            </Link>
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-border" />
        <button
          type="button"
          onClick={() => setShowManualEntry((v) => !v)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {showManualEntry ? "Hide" : "Already have a card ID?"}
        </button>
        <div className="h-px flex-1 bg-border" />
      </div>

      {showManualEntry && (
        <>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Enter Card ID / Serial Number</CardTitle>
              <CardDescription>You&apos;ll find this printed on the back of your card.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleActivate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="uid">Card ID</Label>
                  <Input
                    id="uid"
                    placeholder="e.g. 04A1B2C3D4"
                    value={uid}
                    onChange={(e) => setUid(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Activating..." : "Activate Card"}
                  </Button>
                  <Button type="button" variant="soft" onClick={handleUseDemoCard}>
                    <Sparkles /> Use a demo unassigned card
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Wifi className="size-8" />
              </div>
              <div>
                <p className="font-semibold">Scan NFC Card</p>
                <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                  Tap your NFC card on the back of your mobile device to activate it instantly.
                </p>
              </div>
              <Button variant="outline" onClick={handleSimulateScan} disabled={mutation.isPending}>
                Simulate Scan
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
