import { Input } from "@/components/ui/input"
import type { CheckoutRecipient } from "@/store/checkout-verification-store"

export type BulkRecipientErrors = Array<{ full_name?: string; email?: string }>

export function BulkRecipientFields({
  count,
  recipients,
  errors,
  onChange,
}: {
  count: number
  recipients: CheckoutRecipient[]
  errors: BulkRecipientErrors
  onChange: (index: number, field: "full_name" | "email", value: string) => void
}) {
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm" aria-labelledby="recipient-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="recipient-heading" className="text-lg font-semibold text-foreground">
          Recipient Details
        </h2>
        <span className="text-xs text-muted-foreground">{count} cards</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Enter the full name and email for each card in this order.</p>
      <div className="mt-4 space-y-4">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="rounded-xl border bg-background/60 p-4">
            <p className="mb-3 text-sm font-medium text-foreground">Recipient {index + 1}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={`bulk-recipient-name-${index}`} className="text-sm font-medium text-foreground">
                  Full Name
                </label>
                <Input
                  id={`bulk-recipient-name-${index}`}
                  autoComplete="name"
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
                  autoComplete="email"
                  value={recipients[index]?.email ?? ""}
                  onChange={(event) => onChange(index, "email", event.target.value)}
                  aria-invalid={Boolean(errors[index]?.email)}
                />
                {errors[index]?.email && <p className="text-sm text-destructive">{errors[index].email}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
