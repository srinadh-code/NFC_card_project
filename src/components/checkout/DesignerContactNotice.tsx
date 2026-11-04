import { Info } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Shown to every customer directly above the Place Order / Pay Now button,
 * for every product, quantity and offer. Informational only — not
 * dismissible and nothing to accept. Explicit brand colours (not theme
 * tokens) so it reads the same in the site's light and dark themes.
 */
export function DesignerContactNotice({ className }: { className?: string }) {
  return (
    <div
      role="note"
      aria-label="What happens after you order"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-[#16C7E8]/40 border-l-4 border-l-[#2855C5] bg-[#EEF4FF] p-4 text-left",
        className,
      )}
    >
      <Info className="mt-0.5 size-5 shrink-0 text-[#2855C5]" aria-hidden="true" />
      <p className="text-sm leading-relaxed text-[#101B35]">
        After placing your order, our designers Srinadh or Kavya will contact you to discuss your card design,
        customization requirements and further details.
      </p>
    </div>
  )
}
