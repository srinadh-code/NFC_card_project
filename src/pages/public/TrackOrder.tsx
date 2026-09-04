import { useState, type FormEvent } from "react"
import { CheckCircle2, Circle, Download, PackageSearch } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import PageHeader from "@/components/marketing/PageHeader"
import { useDataStore } from "@/store/data-store"
import { formatCurrency, formatDate } from "@/lib/mock-api"
import type { Order } from "@/types"
import { cn } from "@/lib/utils"

export default function TrackOrder() {
  const orders = useDataStore((s) => s.orders)
  const [orderIdInput, setOrderIdInput] = useState("")
  const [result, setResult] = useState<Order | null | undefined>(undefined)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const query = orderIdInput.trim().toUpperCase()
    if (!query) {
      toast.error("Please enter an order ID.")
      return
    }
    const found = orders.find((o) => o.id.toUpperCase() === query)
    setResult(found ?? null)
  }

  function handleDownloadInvoice(order: Order) {
    const content = [
      `VR's NEXORA Invoice`,
      `Order ID: ${order.id}`,
      `Date: ${formatDate(order.date)}`,
      `Customer: ${order.customerName}`,
      `Payment Method: ${order.paymentMethod}`,
      ``,
      `Items:`,
      ...order.items.map((i) => `- ${i.name} (${i.cardType}, ${i.color}) x${i.qty} — ${formatCurrency(i.price * i.qty)}`),
      ``,
      `Subtotal: ${formatCurrency(order.amount)}`,
      `Shipping: ${formatCurrency(order.shipping)}`,
      `Total: ${formatCurrency(order.total)}`,
    ].join("\n")
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${order.id}-invoice.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success("Invoice downloaded")
  }

  return (
    <div>
      <PageHeader title="Track Your Order" subtitle="Enter your order ID to see live shipping status." />

      <section className="px-4 py-12">
        <div className="mx-auto max-w-xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="order-id" className="sr-only">
                Order ID
              </Label>
              <Input
                id="order-id"
                placeholder="e.g. ORD001"
                value={orderIdInput}
                onChange={(e) => setOrderIdInput(e.target.value)}
              />
            </div>
            <Button type="submit">Track Order</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">Try ORD001</p>
        </div>

        {result === null && (
          <div className="mx-auto mt-10 flex max-w-xl flex-col items-center rounded-2xl border bg-card p-8 text-center shadow-sm">
            <PackageSearch className="size-10 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              We couldn't find that order. Please check the Order ID and try again.
            </p>
          </div>
        )}

        {result && (
          <div className="mx-auto mt-10 grid max-w-4xl gap-8 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Order Details</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Order ID</dt>
                  <dd className="font-mono font-semibold text-foreground">{result.id}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Date</dt>
                  <dd className="text-foreground">{formatDate(result.date)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Payment Method</dt>
                  <dd className="text-foreground">{result.paymentMethod}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-foreground">{result.status}</dd>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <dt className="font-medium text-foreground">Total Amount</dt>
                  <dd className="font-semibold text-primary">{formatCurrency(result.total)}</dd>
                </div>
              </dl>
              <Button variant="outline" className="mt-6 w-full" onClick={() => handleDownloadInvoice(result)}>
                <Download className="size-4" />
                Download Invoice
              </Button>
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Shipping Timeline</h2>
              <ol className="mt-5 space-y-6">
                {result.tracking.map((step, i) => (
                  <li key={step.label} className="relative flex gap-3 pl-1">
                    {i < result.tracking.length - 1 && (
                      <span
                        className={cn(
                          "absolute left-[11px] top-6 h-full w-px",
                          step.done ? "bg-primary" : "bg-border",
                        )}
                      />
                    )}
                    {step.done ? (
                      <CheckCircle2 className="size-5.5 shrink-0 text-primary" />
                    ) : (
                      <Circle className="size-5.5 shrink-0 text-muted-foreground/40" />
                    )}
                    <div>
                      <p className={cn("text-sm font-medium", step.done ? "text-foreground" : "text-muted-foreground")}>
                        {step.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {step.date ? formatDate(step.date) : "Pending"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
