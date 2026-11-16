import { Copy, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { copyTextToClipboard } from "@/lib/clipboard"

export function CopyLink({ url, label, copyLabel = "Copy link", readOnlyField = false, openLabel }: { url: string; label: string; copyLabel?: string; readOnlyField?: boolean; openLabel?: string }) {
  return <div className="space-y-2">
    <p className="text-sm font-medium">{label}</p>
    {readOnlyField ? <Input readOnly value={url} aria-label={label} className="font-mono text-xs" /> : <a href={url} target="_blank" rel="noreferrer" className="block break-all text-sm text-primary underline underline-offset-2">{url}</a>}
    <Button size="sm" type="button" variant="outline" onClick={async () => {
      if (await copyTextToClipboard(url)) toast.success(`${label} copied.`)
      else toast.error("Couldn't copy the link. Please select and copy it manually.")
    }}><Copy className="size-4" />{copyLabel}</Button>
    {openLabel && <Button size="sm" type="button" variant="outline" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{openLabel}</a></Button>}
  </div>
}
