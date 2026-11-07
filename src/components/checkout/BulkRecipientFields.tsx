import { Input } from "@/components/ui/input"
import { AlertTriangle, Circle, CircleX, Info, Loader2 } from "lucide-react"
import type { CheckoutRecipient } from "@/store/checkout-verification-store"
import type { RecipientEmailStatus } from "@/hooks/useRecipientEmailAvailability"

export type BulkRecipientErrors = Array<{ full_name?: string; email?: string; phone?: string }>

export function BulkRecipientFields({
  count,
  recipients,
  errors,
  emailStatuses = [],
  onRetryEmailCheck,
  onChange,
}: {
  count: number
  recipients: CheckoutRecipient[]
  errors: BulkRecipientErrors
  emailStatuses?: RecipientEmailStatus[]
  onRetryEmailCheck?: () => void
  onChange: (index: number, field: keyof CheckoutRecipient, value: string) => void
}) {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm" aria-labelledby="recipient-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="recipient-heading" className="text-lg font-semibold text-foreground">
          Recipient Details
        </h2>
        <span className="text-xs text-muted-foreground">{count} {count === 1 ? "card" : "cards"}</span>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>Important: Please double-check the recipient&apos;s full name, email address and phone number before continuing. These details will be used for NFC card allocation and digital profile creation.</p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Enter the full name, email and phone number of the person who will use each card, including when buying for yourself.</p>
      <div className="mt-4 space-y-4">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="rounded-xl border bg-background/60 p-4">
            <p className="mb-3 text-sm font-medium text-foreground">Recipient {index + 1}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor={`bulk-recipient-name-${index}`} className="text-sm font-medium text-foreground">
                  Full Name
                </label>
                <Input
                  id={`bulk-recipient-name-${index}`}
                  autoComplete={`section-recipient-${index} name`}
                  required
                  value={recipients[index]?.full_name ?? ""}
                  onChange={(event) => onChange(index, "full_name", event.target.value)}
                  aria-invalid={Boolean(errors[index]?.full_name)}
                />
                {errors[index]?.full_name && <p className="text-sm text-destructive">{errors[index].full_name}</p>}
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`bulk-recipient-email-${index}`} className="text-sm font-medium text-foreground">
                  Email Address
                </label>
                <Input
                  id={`bulk-recipient-email-${index}`}
                  type="email"
                  autoComplete={`section-recipient-${index} email`}
                  required
                  value={recipients[index]?.email ?? ""}
                  onChange={(event) => onChange(index, "email", event.target.value)}
                  aria-invalid={Boolean(errors[index]?.email || (
                    emailStatuses[index] && ["invalid", "allocated", "duplicate", "network-error"].includes(emailStatuses[index].state)
                  ))}
                />
                {(() => {
                  const status = emailStatuses[index]
                  const message = errors[index]?.email ?? (
                    status && "message" in status ? status.message : undefined
                  )
                  if (status?.state === "checking") {
                    return <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Checking email availability...</p>
                  }
                  if (status?.state === "available") return null
                  if (status?.state === "allocated") {
                    return (
                      <div role="status" className="space-y-0.5 text-sm text-destructive">
                        <p className="flex items-center gap-1.5"><CircleX className="size-3.5" />Email Already Assigned</p>
                        <p>{message}</p>
                      </div>
                    )
                  }
                  if (status?.state === "network-error") {
                    return (
                      <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-warning">
                        <span className="flex items-center gap-1.5"><AlertTriangle className="size-3.5" />Check Failed: {message}</span>
                        {onRetryEmailCheck && <button type="button" className="font-medium underline" onClick={onRetryEmailCheck}>Retry</button>}
                      </div>
                    )
                  }
                  if (status?.state === "invalid" || status?.state === "duplicate" || errors[index]?.email) {
                    return message ? <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive"><CircleX className="size-3.5 shrink-0" />{message}</p> : null
                  }
                  return <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground"><Circle className="size-3.5" />Email availability not checked yet.</p>
                })()}
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`bulk-recipient-phone-${index}`} className="text-sm font-medium text-foreground">Phone Number</label>
                <Input
                  id={`bulk-recipient-phone-${index}`}
                  type="tel"
                  autoComplete={`section-recipient-${index} tel`}
                  required
                  placeholder="+91 98765 43210"
                  value={recipients[index]?.phone ?? ""}
                  onChange={(event) => onChange(index, "phone", event.target.value)}
                  aria-invalid={Boolean(errors[index]?.phone)}
                />
                {errors[index]?.phone && <p className="text-sm text-destructive">{errors[index].phone}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
