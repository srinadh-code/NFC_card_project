import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check, Copy, Download, FileText, ImageIcon, Printer, RefreshCw, Share2 } from "lucide-react"
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
import { qrApi } from "@/lib/api"

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
    </div>
  )
}
