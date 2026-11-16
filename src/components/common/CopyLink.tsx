import { Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { copyTextToClipboard } from "@/lib/clipboard"

export function CopyLink({ url, label, copyLabel = "Copy link" }: { url: string; label: string; copyLabel?: string }) {
  return <div className="space-y-2">
    <p className="text-sm font-medium">{label}</p>
    <a href={url} target="_blank" rel="noreferrer" className="block break-all text-sm text-primary underline underline-offset-2">{url}</a>
    <Button size="sm" type="button" variant="outline" onClick={async () => {
      if (await copyTextToClipboard(url)) toast.success(`${label} copied.`)
      else toast.error("Couldn't copy the link. Please select and copy it manually.")
    }}><Copy className="size-4" />{copyLabel}</Button>
  </div>
}
