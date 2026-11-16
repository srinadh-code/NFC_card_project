import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Copy, Download, ExternalLink, Loader2, Printer, Share2, Star, Zap } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ErrorState } from "@/components/customer/ErrorState"
import { StatusBadge } from "@/components/admin/StatusBadge"
import { downloadQrPng, downloadQrSvg, downloadQrPdf, getQrPngDataUrl, shareOrCopyLink } from "@/components/customer/qr-utils"
import { googleReviewApi, nfcApi, ApiError, fieldErrorMessage, type GoogleReviewWorkspace } from "@/lib/api"
import { googleReviewKey, useGoogleReview } from "@/hooks/useGoogleReview"
import { useCustomerAuthStore } from "@/store/auth-store"
import { populateQrPrintDocument } from "@/lib/qr-print"
import { safeNfcDestination } from "@/lib/nfc-destination"
import { CopyLink } from "@/components/common/CopyLink"
import { ReviewCardProgrammingLink } from "@/components/common/ReviewCardProgrammingLink"
import { safeProgrammingUrl } from "@/lib/programming-url"

function message(error: unknown) {
  return error instanceof ApiError ? fieldErrorMessage(error.errors, "google_review_url") || fieldErrorMessage(error.errors, "business_name") || error.message : "We couldn't save these settings. Please try again."
}

function GoogleReviewContent({ workspace }: { workspace: GoogleReviewWorkspace }) {
  const customer = useCustomerAuthStore((state) => state.customer)
  const queryClient = useQueryClient()
  const [businessName, setBusinessName] = useState(workspace.business_name)
  const [reviewUrl, setReviewUrl] = useState(workspace.google_review_url)
  const [qrResult, setQrResult] = useState({ url: "", image: "", error: false })
  const [busy, setBusy] = useState(false)
  const qrCard = ["ACTIVE", "ASSIGNED"].flatMap((status) => workspace.cards.filter((card) => card.status === status)).find((card) => safeProgrammingUrl(card.programming_url))
  const programmingUrl = qrCard ? safeProgrammingUrl(qrCard.programming_url) : null
  const ready = workspace.configured && Boolean(programmingUrl)
  const qrUrl = ready ? programmingUrl : null
  const qrImage = qrResult.url === qrUrl ? qrResult.image : ""
  const qrError = qrResult.url === qrUrl && qrResult.error
  const savedUrl = safeNfcDestination(workspace.google_review_url, window.location.origin)
  const savedDestination = savedUrl && /^https:\/\/(?:search|www|maps)\.google\.com\//.test(savedUrl) ? savedUrl : null
  useEffect(() => {
    let current = true
    if (qrUrl) void getQrPngDataUrl(qrUrl).then((image) => { if (current) setQrResult({ url: qrUrl, image, error: false }) }).catch(() => { if (current) setQrResult({ url: qrUrl, image: "", error: true }) })
    return () => { current = false }
  }, [qrUrl])

  const save = useMutation({
    mutationFn: () => googleReviewApi.update({ business_name: businessName.trim(), google_review_url: reviewUrl.trim() }),
    onSuccess: (updated) => {
      queryClient.setQueryData(googleReviewKey(customer?.id), updated)
      setBusinessName(updated.business_name)
      setReviewUrl(updated.google_review_url)
      toast.success("Business settings saved.")
    },
    onError: (error) => toast.error(message(error)),
  })
  const activate = useMutation({
    mutationFn: (id: string) => nfcApi.activateAssigned(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: googleReviewKey(customer?.id) })
      void queryClient.invalidateQueries({ queryKey: ["nfc-cards-mine"] })
      toast.success("Google Review card activated.")
    },
    onError: (error) => toast.error(message(error)),
  })
  const reviewUrlError = save.error instanceof ApiError ? fieldErrorMessage(save.error.errors, "google_review_url") : null
  const businessNameError = save.error instanceof ApiError ? fieldErrorMessage(save.error.errors, "business_name") : null

  async function exportQr(kind: "png" | "svg" | "pdf") {
    if (!qrUrl) return
    setBusy(true)
    try {
      if (kind === "png") await downloadQrPng(qrUrl, "google-review-qr.png")
      else if (kind === "svg") await downloadQrSvg(qrUrl, "google-review-qr.svg")
      else await downloadQrPdf(qrUrl, "google-review-qr.pdf", businessName || "Google Review")
    } catch { toast.error("Couldn't download the QR code. Please try again.") }
    finally { setBusy(false) }
  }
  async function copy() {
    if (!qrUrl) return
    try { await navigator.clipboard.writeText(qrUrl); toast.success("Review card link copied.") }
    catch { toast.error("Couldn't copy the link.") }
  }
  async function share() {
    if (!qrUrl) return
    const result = await shareOrCopyLink(qrUrl, businessName || "Google Review")
    if (result === "copied") toast.success("Review card link copied.")
    if (result === "failed") toast.error("Couldn't share the link.")
  }
  function print() {
    if (!qrImage) return
    const iframe = document.createElement("iframe")
    iframe.style.position = "fixed"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (doc) {
      populateQrPrintDocument(doc, qrImage, businessName || "Google Review")
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    }
    setTimeout(() => iframe.remove(), 1000)
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Star className="size-6 text-primary" />Google Review</h1><p className="mt-1 text-muted-foreground">Manage your Google Maps business destination and NFC card in your existing account.</p></div>
    <div className="grid gap-4 sm:grid-cols-3">
      {[["NFC taps", workspace.stats.taps], ["QR scans", workspace.stats.qr_scans], ["Total opens", workspace.stats.total]].map(([label, value]) => <Card key={label}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></CardContent></Card>)}
    </div>
    <p className="text-xs text-muted-foreground">These counts record opens of your review card link. They do not measure submitted Google reviews.</p>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Business settings</CardTitle><CardDescription>Paste your business location link from Google Maps → Share → Copy link, or a direct Google review link. Visitors can open your listing and select Write a review. You can configure it before your physical card arrives.</CardDescription></CardHeader><CardContent>
        <form onSubmit={(event: FormEvent) => { event.preventDefault(); if (!save.isPending) save.mutate() }} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="review-business-name">Business name</Label><Input id="review-business-name" required maxLength={150} value={businessName} onChange={(event) => setBusinessName(event.target.value)} aria-invalid={!!businessNameError} aria-describedby={businessNameError ? "review-business-name-error" : undefined} />{businessNameError && <p id="review-business-name-error" role="alert" className="text-sm text-destructive">{businessNameError}</p>}</div>
          <div className="space-y-2"><Label htmlFor="google-review-url">Google Maps business location URL</Label><Input id="google-review-url" required type="url" maxLength={2048} placeholder="https://maps.app.goo.gl/your-business" value={reviewUrl} onChange={(event) => setReviewUrl(event.target.value)} aria-invalid={!!reviewUrlError} aria-describedby={reviewUrlError ? "google-review-url-error" : undefined} />{reviewUrlError && <p id="google-review-url-error" role="alert" className="text-sm text-destructive">{reviewUrlError}</p>}</div>
          {save.isError && !reviewUrlError && !businessNameError && <p role="alert" className="text-sm text-destructive">{message(save.error)}</p>}
          <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save settings"}</Button>
          {save.isSuccess && <p role="status" className="text-sm text-success">Business settings saved. Your NFC link and QR code keep the same URL when you edit this destination.</p>}
        </form>
        <div className="mt-5 border-t pt-4">
          {savedDestination ? <CopyLink url={savedDestination} label="Saved Google Maps destination" copyLabel="Copy destination" /> : <p className="text-sm text-muted-foreground">Save a valid Google Maps business link or direct review link to open or copy the saved destination.</p>}
        </div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Review QR code</CardTitle><CardDescription>The same QR link keeps working when you update the destination.</CardDescription></CardHeader><CardContent className="space-y-4">
        {ready ? <>
          {qrCard?.status !== "ACTIVE" && <p className="text-sm text-muted-foreground">Your QR code is ready to download. Activate this assigned card before customers scan it or tap the NFC card.</p>}
          <div className="flex justify-center rounded-xl border bg-white p-4">{qrImage ? <img src={qrImage} width={240} height={240} alt="Google Review QR code" /> : <p className="py-12 text-sm text-slate-600">{qrError ? "Couldn't generate the QR preview. Downloads remain available." : "Generating QR code…"}</p>}</div>
          <p className="break-all text-xs text-muted-foreground">{qrUrl}</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => exportQr("png")} disabled={busy}><Download />PNG</Button><Button size="sm" variant="outline" onClick={() => exportQr("svg")} disabled={busy}>SVG</Button><Button size="sm" variant="outline" onClick={() => exportQr("pdf")} disabled={busy}>PDF</Button><Button size="sm" variant="outline" onClick={print} disabled={!qrImage}><Printer />Print</Button><Button size="sm" variant="outline" onClick={copy}><Copy />Copy</Button><Button size="sm" variant="outline" onClick={share}><Share2 />Share</Button></div>
        </> : <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">{!workspace.configured ? "Save your business name and Google Maps destination to configure your card." : workspace.cards.length === 0 ? "Your NFC link and QR code will appear automatically after a physical Google Review card is assigned." : workspace.cards.some((card) => card.status === "ACTIVE" || card.status === "ASSIGNED") ? "The public NFC link is unavailable. Contact support before programming this card." : "Your review card is unavailable. Contact support to restore access."}</p>}
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Google Review NFC cards</CardTitle></CardHeader><CardContent className="space-y-3">
      {workspace.cards.length === 0 ? <p className="text-sm text-muted-foreground">Your paid review allocation is ready. Your physical card has not been assigned yet.</p> : workspace.cards.map((card) => <div key={card.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><p className="font-semibold">Google Review Card</p><p className="font-mono text-xs text-muted-foreground">{card.serial_number} · {card.uid}</p></div><StatusBadge status={card.status.toLowerCase().replace(/^./, (letter) => letter.toUpperCase())} />{card.status === "ASSIGNED" && <Button size="sm" disabled={activate.isPending} onClick={() => activate.mutate(String(card.id))}><Zap />{activate.isPending ? "Activating…" : "Activate card"}</Button>}<div className="w-full">{card.status !== "UNASSIGNED" && <ReviewCardProgrammingLink url={card.programming_url} showQr={workspace.configured && (card.status === "ACTIVE" || card.status === "ASSIGNED")} />}</div></div>)}
      {ready && programmingUrl && <a href={programmingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ExternalLink className="size-4" />Open review card</a>}
    </CardContent></Card>
  </div>
}

export default function GoogleReview() {
  const query = useGoogleReview()
  if (query.isPending) return <div className="flex justify-center p-12"><Loader2 className="size-6 animate-spin" aria-label="Loading Google Review" /></div>
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!query.data.eligible) return <div className="mx-auto max-w-xl space-y-4 rounded-2xl border bg-card p-6"><h1 className="text-xl font-bold">Google Review Card</h1><p className="text-muted-foreground">This account has no Google Review card allocation. An order purchased for someone else belongs in your purchase history.</p><Button asChild><Link to="/shop">View cards</Link></Button><Button variant="outline" asChild><Link to="/purchaser/orders">My orders</Link></Button></div>
  return <GoogleReviewContent workspace={query.data} />
}
