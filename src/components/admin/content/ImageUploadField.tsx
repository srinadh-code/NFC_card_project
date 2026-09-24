import { useRef, useState, type ChangeEvent } from "react"
import { toast } from "sonner"
import { ImageIcon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"

const DEFAULT_ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/svg+xml"
const DEFAULT_FORMATS_HELP = "JPEG, PNG, WEBP or SVG. Max 5MB."

// Image upload/replace/remove control shared by every content section that
// carries an image (Hero, Built From Experience, Testimonials, Companies,
// General Settings > Branding). Never assumes success — surfaces the real
// backend response/error via toast, and only re-renders currentUrl once the
// parent's onUpload/onRemove promise (driven by the real API response)
// resolves. `accept`/`formatsHelp` default to the common image set every
// other caller uses — only overridden where the backend allows something
// extra (e.g. Favicon's .ico, via common.image_storage.ALLOWED_CONTENT_TYPES).
export function ImageUploadField({
  currentUrl,
  onUpload,
  onRemove,
  disabled,
  accept = DEFAULT_ACCEPTED_TYPES,
  formatsHelp = DEFAULT_FORMATS_HELP,
}: {
  currentUrl?: string | null
  onUpload: (file: File) => Promise<void>
  onRemove: () => Promise<void>
  disabled?: boolean
  accept?: string
  formatsHelp?: string
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
          accept={accept}
          className="hidden"
          onChange={handleFileChange}
        />
        <p className="text-xs text-muted-foreground">{formatsHelp}</p>
      </div>
    </div>
  )
}
