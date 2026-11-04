import { useState } from "react"
import { NfcCardFace } from "@/components/marketing/NfcCardShowcase"
import { cloudinaryUrl } from "@/lib/order-card-pricing"
import type { OrderCardTone } from "@/types/content"

/** A product photo that falls back to the drawn card mockup when there's no
 * image or the image can't be loaded (e.g. its Cloudinary asset was
 * deleted), so customers never see a broken-image icon. */
export function ProductImage({
  url,
  alt,
  width,
  tone,
  className,
  mockupClassName = "h-40 w-64 -rotate-3",
  loading,
}: {
  url?: string
  alt: string
  width: number
  tone?: OrderCardTone | ""
  className?: string
  mockupClassName?: string
  loading?: "lazy" | "eager"
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (!url || failedUrl === url) {
    return (
      <div className={mockupClassName}>
        <NfcCardFace tone={tone || "custom"} />
      </div>
    )
  }
  return <img src={cloudinaryUrl(url, width)} alt={alt} loading={loading} className={className} onError={() => setFailedUrl(url)} />
}
