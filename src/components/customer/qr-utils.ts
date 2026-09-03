import QRCode from "qrcode"
import { jsPDF } from "jspdf"

// Shared QR-code generation / export helpers used by the QR Code page and the
// My Card page, so both can offer real PNG/SVG/PDF downloads and share/copy
// actions without duplicating the plumbing.

export async function getQrPngDataUrl(text: string, size = 320) {
  return QRCode.toDataURL(text, { width: size, margin: 1 })
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

export async function downloadQrPng(text: string, filename: string) {
  const dataUrl = await getQrPngDataUrl(text, 512)
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  triggerBlobDownload(blob, filename)
}

export async function downloadQrSvg(text: string, filename: string) {
  const svg = await QRCode.toString(text, { type: "svg", width: 320, margin: 1 })
  const blob = new Blob([svg], { type: "image/svg+xml" })
  triggerBlobDownload(blob, filename)
}

export async function downloadQrPdf(text: string, filename: string, caption: string) {
  const dataUrl = await getQrPngDataUrl(text, 512)
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  doc.addImage(dataUrl, "PNG", pageWidth / 2 - 50, 30, 100, 100)
  doc.setFontSize(14)
  doc.text(caption, pageWidth / 2, 150, { align: "center" })
  doc.setFontSize(10)
  doc.setTextColor(130)
  doc.text(text, pageWidth / 2, 158, { align: "center" })
  doc.save(filename)
}

export type ShareResult = "shared" | "cancelled" | "copied" | "failed"

export async function shareOrCopyLink(url: string, title: string): Promise<ShareResult> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, url })
      return "shared"
    } catch {
      return "cancelled"
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return "copied"
  } catch {
    return "failed"
  }
}
