import { useEffect, useState } from "react"
import { Download } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CopyLink } from "@/components/common/CopyLink"
import { downloadQrPng, getQrPngDataUrl } from "@/components/customer/qr-utils"
import { safeProgrammingUrl } from "@/lib/programming-url"

export function ReviewCardProgrammingLink({ url, showQr = false }: { url?: string | null; showQr?: boolean }) {
  const programmingUrl = safeProgrammingUrl(url)
  const [preview, setPreview] = useState({ url: "", image: "", failed: false })
  const [downloading, setDownloading] = useState(false)
  useEffect(() => {
    let current = true
    if (programmingUrl && showQr) void getQrPngDataUrl(programmingUrl).then((image) => {
      if (current) setPreview({ url: programmingUrl, image, failed: false })
    }).catch(() => { if (current) setPreview({ url: programmingUrl, image: "", failed: true }) })
    return () => { current = false }
  }, [programmingUrl, showQr])
  if (!programmingUrl) return <p className="text-sm text-muted-foreground">The public NFC link is unavailable. Contact support before programming this card.</p>
  return <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
    <CopyLink url={programmingUrl} label="NFC programming URL" copyLabel="Copy NFC URL" />
    <p className="text-xs text-muted-foreground">In MyNFC, write a URL record with this link. It stays the same when you update the Google review destination. The card opens after activation and review-link setup.</p>
    {showQr && <div className="space-y-2">
      {preview.url === programmingUrl && preview.image ? <img src={preview.image} width={160} height={160} alt="NFC programming QR code" className="rounded-lg border bg-white p-2" /> : <p className="text-xs text-muted-foreground">{preview.url === programmingUrl && preview.failed ? "QR preview unavailable. You can still download the QR code." : "Generating NFC QR code…"}</p>}
      <Button size="sm" type="button" variant="outline" disabled={downloading} onClick={async () => {
        setDownloading(true)
        try { await downloadQrPng(programmingUrl, "google-review-nfc-qr.png") }
        catch { toast.error("Couldn't download the NFC QR code. Please try again.") }
        finally { setDownloading(false) }
      }}><Download className="size-4" />Download NFC QR</Button>
    </div>}
  </div>
}
