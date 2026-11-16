import { CopyLink } from "@/components/common/CopyLink"
import { safeProgrammingUrl } from "@/lib/programming-url"

export function ReviewCardProgrammingLink({ url }: { url?: string | null }) {
  const programmingUrl = safeProgrammingUrl(url)
  if (!programmingUrl) return null
  return <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
    <CopyLink url={programmingUrl} label="NFC programming URL" copyLabel="Copy NFC URL" />
    <p className="text-xs text-muted-foreground">In MyNFC, write a URL record with this link. It stays the same when you update the Google review destination. The card opens after activation and review-link setup.</p>
  </div>
}
