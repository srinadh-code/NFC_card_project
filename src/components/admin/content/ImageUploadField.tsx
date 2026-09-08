import { useRef, useState, type ChangeEvent } from "react"
import { toast } from "sonner"
import { ImageIcon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/svg+xml"

// Image upload/replace/remove control shared by every content section that
// carries an image (Hero, Built From Experience, Testimonials, Companies).
// Never assumes success — surfaces the real backend response/error via
// toast, and only re-renders currentUrl once the parent's onUpload/onRemove
// promise (driven by the real API response) resolves.
export function ImageUploadField({
  currentUrl,
  onUpload,
  onRemove,
  disabled,
}: {
  currentUrl?: string | null
  onUpload: (file: File) => Promise<void>
  onRemove: () => Promise<void>
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true)
    try {
      await onUpload(file)
      toast.success("Image uploaded.")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to upload image.")
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setBusy(true)
    try {
      await onRemove()
      toast.success("Image removed.")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove image.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted">
        {currentUrl ? (
          <img src={currentUrl} alt="" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {currentUrl ? "Replace" : "Upload"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy || !currentUrl}
            onClick={handleRemove}
          >
            Remove
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={handleFileChange}
        />
        <p className="text-xs text-muted-foreground">JPEG, PNG, WEBP or SVG. Max 5MB.</p>
      </div>
    </div>
  )
}
