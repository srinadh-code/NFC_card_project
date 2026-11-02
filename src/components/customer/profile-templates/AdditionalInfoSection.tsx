import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { CustomField } from "@/types"

/** Only http(s) values become links — never javascript:/data: etc. */
function toSafeHref(value: string): string | null {
  const trimmed = value.trim()
  if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed
  if (/^www\.\S+\.\S+$/i.test(trimmed)) return `https://${trimmed}`
  return null
}

interface AdditionalInfoSectionProps {
  /** Already filtered/sorted — see getPublicCustomFields in shared.tsx. */
  fields: CustomField[]
  /** Each template renders the section title in its own heading style. */
  heading: ReactNode
  className?: string
  itemClassName?: string
  itemStyle?: CSSProperties
  labelClassName?: string
  labelStyle?: CSSProperties
  valueClassName?: string
  valueStyle?: CSSProperties
}

/**
 * "Additional Information" — the customer's own custom fields (My Profile >
 * Custom Fields), rendered label/value with nothing hardcoded. Shared by
 * every public-card template so the rules (filtering, ordering, link
 * safety, long values wrapping instead of being cut off) can't drift; each
 * template only passes its own colors/surfaces. Renders nothing when there
 * are no fields, so the whole section disappears.
 */
export function AdditionalInfoSection({
  fields,
  heading,
  className,
  // Defaults match the Contact rows' white tiles. Explicit colors (not
  // theme tokens) so the tile reads the same whatever the site theme, and
  // a ring rather than a border (index.css's global `*` border-color would
  // override a border-color utility).
  itemClassName = "rounded-2xl bg-white px-3.5 py-2.5 shadow-[0_2px_8px_rgba(15,23,42,0.05)] ring-1 ring-slate-200",
  itemStyle,
  labelClassName = "text-slate-500",
  labelStyle,
  valueClassName = "text-slate-900",
  valueStyle,
}: AdditionalInfoSectionProps) {
  if (fields.length === 0) return null
  return (
    <section className={cn("w-full", className)} aria-label="Additional Information">
      {heading}
      <dl className="grid grid-cols-1 gap-2.5">
        {fields.map((field) => {
          const href = toSafeHref(field.value)
          return (
            <div key={field.id} className={cn("text-left", itemClassName)} style={itemStyle}>
              <dt
                className={cn("text-[10px] font-medium uppercase tracking-wide break-words", labelClassName)}
                style={labelStyle}
              >
                {field.label}
              </dt>
              <dd
                className={cn("mt-0.5 text-sm font-semibold break-words whitespace-pre-line", valueClassName)}
                style={valueStyle}
              >
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    {field.value}
                  </a>
                ) : (
                  field.value
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
