import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Nfc,
  PackageSearch,
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
import { StatusBadge } from "@/components/admin/StatusBadge"
import { useCustomerAuthStore } from "@/store/auth-store"
import {
  useDataStore,
  selectCardsByCustomer,
  selectOrdersByCustomer,
  selectProfileByCustomer,
} from "@/store/data-store"
import { formatDate } from "@/lib/mock-api"
import { downloadQrPng, shareOrCopyLink } from "@/components/customer/qr-utils"

const IN_PROGRESS_ORDER_STATUSES = ["Pending", "Processing", "Shipped"]

export default function CustomerMyCard() {
  const customer = useCustomerAuthStore((s) => s.customer)
  const cards = useDataStore(selectCardsByCustomer(customer?.id ?? ""))
  const orders = useDataStore(selectOrdersByCustomer(customer?.id ?? ""))
  const allCards = useDataStore((s) => s.cards)
  const activateCard = useDataStore((s) => s.activateCard)
  const activateAssignedCard = useDataStore((s) => s.activateAssignedCard)
  const profile = useDataStore(selectProfileByCustomer(customer?.id ?? ""))
  const queryClient = useQueryClient()

  const activeCard = cards.find((c) => c.status === "Active") ?? null
  const assignedCard = cards.find((c) => c.status === "Assigned") ?? null
  const processingOrder =
    [...orders]
      .filter((o) => IN_PROGRESS_ORDER_STATUSES.includes(o.status))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null

  const [uid, setUid] = useState("")
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const mutation = useMutation({
    mutationFn: async (cardUid: string) => {
      const result = activateCard(cardUid, customer?.id ?? "")
      if (!result) throw new Error("not found")
      return result
    },
    onSuccess: () => {
      toast.success("Card activated successfully!")
      setUid("")
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
    },
    onError: () => {
      toast.error("We couldn't find a card with that ID. Please check and try again.")
    },
  })

  const activateAssignedMutation = useMutation({
    mutationFn: async (cardId: string) => {
      const result = activateAssignedCard(cardId)
      if (!result) throw new Error("not found")
      return result
    },
    onSuccess: () => {
      toast.success("Card activated successfully! Your profile is now live.")
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
    },
    onError: () => toast.error("Something went wrong activating your card. Please try again."),
  })

  function findDemoUnassignedUid() {
    const unassigned = allCards.find((c) => c.status === "Unassigned")
    return unassigned?.uid ?? null
  }

  function handleUseDemoCard() {
    const demoUid = findDemoUnassignedUid()
    if (!demoUid) {
      toast.error("No unassigned demo cards are available right now.")
      return
    }
    setUid(demoUid)
    toast.success("Demo card ID filled in. Click Activate Card to continue.")
  }

  function handleSimulateScan() {
    const demoUid = findDemoUnassignedUid()
    if (!demoUid) {
      toast.error("No unassigned demo cards are available right now.")
      return
    }
    mutation.mutate(demoUid)
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
    const result = await shareOrCopyLink(profileUrl, `${profile.fullName} — TapLink`)
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
              <span className="text-lg font-bold tracking-wide">TapLink</span>
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
        </div>
      </div>
    )
  }

  // A card has already been assigned by admin but the customer hasn't
  // tapped "Activate" yet — no need to type/guess a UID, it's right here.
  if (assignedCard) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Alert className="rounded-xl border-primary/30 bg-primary/5">
          <Zap className="text-primary" />
          <AlertTitle>Your card has arrived — activate it to go live</AlertTitle>
          <AlertDescription>
            TapLink has assigned this physical card to your account. Tap Activate below to link it to your
            profile.
          </AlertDescription>
        </Alert>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Your NFC Card</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Card UID</p>
              <p className="font-mono text-sm font-medium">{assignedCard.uid}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Serial Number</p>
              <p className="font-mono text-sm font-medium">{assignedCard.serialNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <StatusBadge status={assignedCard.status} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Assigned Date</p>
              <p className="text-sm font-medium">
                {assignedCard.assignedOn ? formatDate(assignedCard.assignedOn) : "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Button
          size="lg"
          onClick={() => activateAssignedMutation.mutate(assignedCard.id)}
          disabled={activateAssignedMutation.isPending}
        >
          <Zap /> {activateAssignedMutation.isPending ? "Activating..." : "Activate Now"}
        </Button>
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
                <p className="font-semibold">Order {processingOrder.id} is being processed</p>
                <p className="text-sm text-muted-foreground">
                  Placed on {formatDate(processingOrder.date)} · Status:{" "}
                  <StatusBadge status={processingOrder.status} className="ml-1" />
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
            Order your TapLink card to get started, or activate one below if you already have one.
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
