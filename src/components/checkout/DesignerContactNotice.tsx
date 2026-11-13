import { Info } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Shown to every customer directly above the Place Order / Pay Now button,
 * for every product, quantity and offer. Informational only — not
 * dismissible and nothing to accept. A pale brand surface keeps the note
 * readable in the site's light and dark themes.
 */
export function DesignerContactNotice({ className }: { className?: string }) {
  return (
    <div
      role="note"
      aria-label="What happens after you order"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-[var(--public-accent)]/40 border-l-4 border-l-[var(--public-accent)] bg-[var(--public-soft)] p-4 text-left",
        className,
      )}
    >
      <Info className="mt-0.5 size-5 shrink-0 text-[var(--public-accent)]" aria-hidden="true" />
      <p className="text-sm leading-relaxed text-[var(--public-navy)]">
        After placing your order, our designers Srinadh or Kavya will contact you to discuss your card design,
        customization requirements and further details.
      </p>
    </div>
  )
}
