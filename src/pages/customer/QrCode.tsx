import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check, Copy, Download, FileText, ImageIcon, Printer, RefreshCw, Share2, Star } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemedDigitalCardPreview } from "@/components/customer/profile-templates"
import { ProfileTemplatesSection } from "@/components/customer/ProfileTemplatesSection"
import { ErrorState } from "@/components/customer/ErrorState"
import { ProfileNotReady } from "@/components/customer/ProfileNotReady"
import { useEnsuredProfile } from "@/hooks/use-ensured-profile"
import { downloadQrPng, downloadQrSvg, downloadQrPdf, shareOrCopyLink } from "@/components/customer/qr-utils"
import { qrApi, ordersApi } from "@/lib/api"
import { NEXORA_CARD_TYPES } from "@/data/constants"

// The Google Review Card is a separate purchasable product (see /shop), not
// a profile template — its own section below is shown only once we can
// tell, from the customer's real order history, that they actually bought
// one. Reuses the same ["customer-orders", 1] query MyCard.tsx already
// uses, so this is normally served from cache rather than firing a second
// request. A cancelled order doesn't count as an active purchase.
const GOOGLE_REVIEW_CARD = NEXORA_CARD_TYPES.find((c) => c.id === "google-review")

function printQr(dataUrl: string, title: string) {
  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }
  doc.open()
  doc.write(`
    <html>
      <head><title>${title}</title></head>
      <body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
        <img src="${dataUrl}" style="width:320px;height:320px;" />
        <p style="margin-top:16px;font-size:14px;color:#334155;">${title}</p>
      </body>
    </html>
  `)
  doc.close()
  iframe.contentWindow?.focus()
  iframe.contentWindow?.print()
  setTimeout(() => document.body.removeChild(iframe), 1000)
}

export default function CustomerQrCode() {
  const { customer, profile, stuck, retry } = useEnsuredProfile()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const qrQuery = useQuery({
    queryKey: ["customer-qr"],
    queryFn: qrApi.getOrCreate,
    enabled: Boolean(customer && profile),
  })

  // Same query MyCard.tsx uses for its own order lookups — sharing the key
  // means this is a cache hit (no extra request) whenever that page has
  // already been visited this session.
  const ordersQuery = useQuery({
    queryKey: ["customer-orders", 1],
    queryFn: () => ordersApi.list(1),
    enabled: Boolean(customer),
  })
  const hasGoogleReviewCard = (ordersQuery.data?.items ?? []).some(
    (order) => order.status !== "CANCELLED" && order.items.some((item) => item.card_type === "REVIEW"),
  )

  const regenerateMutation = useMutation({
    mutationFn: qrApi.regenerate,
    onSuccess: (qr) => {
      queryClient.setQueryData(["customer-qr"], qr)
      toast.success("QR code regenerated.")
    },
    onError: () => toast.error("Couldn't regenerate the QR code. Please try again."),
  })

  if (!customer) return null

  if (stuck) {
    return (
      <div className="mx-auto max-w-4xl">
        <ProfileNotReady onRetry={retry} />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (qrQuery.isError) {
    return (
      <div className="mx-auto max-w-4xl">
        <ErrorState error={qrQuery.error} onRetry={() => qrQuery.refetch()} />
      </div>
    )
  }

  const { username, fullName } = profile
  const prettyUrl = `${window.location.host}/u/${username}`
  // The backend's stored QR encodes this exact URL (with a `?src=qr`
  // tracking marker) — every export format below is generated from it, so
  // scanning any of them (PNG, SVG, PDF, print) records a real QR_SCAN.
  const realUrl = qrQuery.data?.target_url ?? `${window.location.origin}/u/${username}`
  const isLoading = qrQuery.isLoading
  const qrDataUrl = qrQuery.data?.image ?? null

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(realUrl)
      setCopied(true)
      toast.success("Link copied to clipboard!")
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error("Couldn't copy the link. Please copy it manually.")
    }
  }

  async function runExport(kind: "png" | "svg" | "pdf") {
    setBusyAction(kind)
    try {
      if (kind === "png") await downloadQrPng(realUrl, `${username}-qr-code.png`)
      else if (kind === "svg") await downloadQrSvg(realUrl, `${username}-qr-code.svg`)
      else await downloadQrPdf(realUrl, `${username}-qr-code.pdf`, `${fullName} — VR's NEXORA`)
      toast.success(`QR code downloaded as ${kind.toUpperCase()}.`)
    } catch {
      toast.error("Couldn't generate that file right now.")
    } finally {
      setBusyAction(null)
    }
  }

  async function handleShare() {
    const result = await shareOrCopyLink(realUrl, `${fullName} — VR's NEXORA`)
    if (result === "shared") toast.success("Shared!")
    else if (result === "copied") toast.success("Sharing isn't supported here — link copied instead!")
    else if (result === "failed") toast.error("Couldn't share or copy the link.")
  }

  function handlePrint() {
    if (!qrDataUrl) {
      toast.error("QR code is still generating — try again in a moment.")
      return
    }
    printQr(qrDataUrl, `${fullName} — ${prettyUrl}`)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">QR Code</h1>
        <p className="text-sm text-muted-foreground">
          Share your digital business card instantly with a scannable QR code.
        </p>
      </div>

      <ProfileTemplatesSection profile={profile} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Your Profile Link</CardTitle>
            <CardDescription>Anyone who scans your code lands on this page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-2">
              <Input readOnly value={prettyUrl} className="text-sm" />
              <Button size="icon" variant="outline" onClick={handleCopy} aria-label="Copy link">
                {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              </Button>
            </div>

            <div className="flex justify-center rounded-xl border bg-white p-6">
              {isLoading || !qrDataUrl ? (
                <Skeleton className="size-[240px]" />
              ) : (
                <img src={qrDataUrl} alt="Profile QR code" width={240} height={240} className="rounded-lg" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Button onClick={() => runExport("png")} disabled={busyAction !== null}>
                <ImageIcon /> {busyAction === "png" ? "…" : "PNG"}
              </Button>
              <Button variant="outline" onClick={() => runExport("svg")} disabled={busyAction !== null}>
                <Download /> {busyAction === "svg" ? "…" : "SVG"}
              </Button>
              <Button variant="outline" onClick={() => runExport("pdf")} disabled={busyAction !== null}>
                <FileText /> {busyAction === "pdf" ? "…" : "PDF"}
              </Button>
              <Button variant="outline" onClick={handlePrint} disabled={!qrDataUrl}>
                <Printer /> Print
              </Button>
            </div>
            <Button variant="soft" className="w-full" onClick={handleShare}>
              <Share2 /> Share Link
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
            >
              <RefreshCw className={regenerateMutation.isPending ? "animate-spin" : ""} />
              {regenerateMutation.isPending ? "Regenerating…" : "Regenerate QR Code"}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>What people see after scanning your code.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-6">
            <ThemedDigitalCardPreview profile={profile} onShare={handleShare} />
          </CardContent>
        </Card>
      </div>

      {/* Separate from Profile Templates above — the Google Review Card is a
          distinct purchased product, presented as its own premium product
          showcase (large card visual + status + review-destination/QR
          panel) rather than another template choice or a plain text row.
          Shown only once the customer's real order history confirms they
          own one (see `hasGoogleReviewCard`) — same ownership check as
          before, unchanged. The review-destination/QR panel still
          honestly reflects that no Google Review URL exists in any current
          data source (see QrCode's report on this) rather than fabricating
          one — Download/Share stay visible for the expected hierarchy but
          disabled until that data exists. */}
      {hasGoogleReviewCard && GOOGLE_REVIEW_CARD && (
        <Card className="overflow-hidden rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="size-5 text-primary" /> Google Review Card
            </CardTitle>
            <CardDescription>Send customers directly to your Google Review page with one scan.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
              {/* Left: large physical-card showcase — the exact "card
                  showcase" panel treatment /shop uses for this same image,
                  reused here at dashboard scale so the card reads as a real
                  premium product rather than an icon-sized thumbnail. */}
              <div className="flex justify-center">
                <div className="relative flex h-72 w-full max-w-sm items-center justify-center overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0B0F1A] via-[#12142B] to-[#1A0F2E] p-8 shadow-2xl">
                  <div className="pointer-events-none absolute left-1/4 top-1/5 size-48 rounded-full bg-[#7C3AED]/30 blur-[90px]" />
                  <div className="pointer-events-none absolute bottom-1/5 right-1/4 size-48 rounded-full bg-[#2563EB]/30 blur-[90px]" />
                  <div className="relative h-40 w-full max-w-xs animate-float-slow">
                    <div className="h-full w-full -rotate-3 transition-transform duration-500 ease-out hover:-rotate-1 hover:scale-[1.05]">
                      <img
                        src={GOOGLE_REVIEW_CARD.image}
                        alt={GOOGLE_REVIEW_CARD.name}
                        className="h-full w-full object-contain drop-shadow-2xl"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: status + description + review destination + QR */}
              <div className="space-y-5">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                  <span className="size-1.5 rounded-full bg-success" /> Google Review Card Active
                </span>

                <p className="text-sm text-muted-foreground">
                  Make it easy for customers to leave a Google Review with one simple scan.
                </p>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Review Destination
                  </p>
                  <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    Not set up yet — contact support to add your business's Google Review link.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Google Review QR
                  </p>
                  <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
                    Your Google Review QR code will appear here once your Google Review link is set up.
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-3">
                    <Button size="sm" disabled className="disabled:opacity-60">
                      <Download className="size-4" /> Download
                    </Button>
                    <Button size="sm" variant="outline" disabled className="disabled:opacity-60">
                      <Share2 className="size-4" /> Share
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Download and share unlock once your Google Review link is set up.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
