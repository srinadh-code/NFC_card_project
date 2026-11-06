import { Input } from "@/components/ui/input"
import type { CheckoutRecipient } from "@/store/checkout-verification-store"

export type BulkRecipientErrors = Array<{ full_name?: string; email?: string; phone?: string }>

export function BulkRecipientFields({
  count,
  recipients,
  errors,
  onChange,
}: {
  count: number
  recipients: CheckoutRecipient[]
  errors: BulkRecipientErrors
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
                  aria-invalid={Boolean(errors[index]?.email)}
                />
                {errors[index]?.email && <p className="text-sm text-destructive">{errors[index].email}</p>}
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
