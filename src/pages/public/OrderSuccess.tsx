import { useLocation, useNavigate } from "react-router-dom"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatOrderNumber } from "@/lib/mock-api"

export default function OrderSuccess() {
  const navigate = useNavigate()
  const location = useLocation()
  // The real, backend-created order's own id and tracking_token (see
  // Checkout.tsx's navigate("/order-success", { state: { orderId, trackingToken, customerName } }))
  // — formatted for display/URL only, never generated here. The token is
  // the actual security credential for the public Track Order link (the
  // order id alone is a guessable sequential number — see
  // PublicOrderTrackingView); customerName is passed along only as a
  // cosmetic personalization for the Track Order page (never a credential —
  // see accounts/emails.py's and PublicOrderTrackingView's docstrings), and
  // travels via router state, not the URL, so it's never in a shareable link.
  const state = location.state as { orderId?: string; trackingToken?: string; customerName?: string } | null
  const rawOrderId = state?.orderId ?? null
  const trackingToken = state?.trackingToken ?? null
  const customerName = state?.customerName ?? null
  const orderNumber = rawOrderId ? formatOrderNumber(rawOrderId) : null

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <CheckCircle2 className="size-20 text-success" />
      <h1 className="mt-6 text-3xl font-bold text-foreground">Thank You!</h1>
      <p className="mt-2 text-muted-foreground">Your order has been placed successfully.</p>
      {orderNumber && <p className="mt-4 font-mono text-lg font-bold text-primary">Order ID: {orderNumber}</p>}
      <p className="mt-6 text-sm text-muted-foreground">
        A confirmation email with your order details has been sent to your inbox. Your card will
        be delivered within 5-7 business days.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <Button size="lg" onClick={() => navigate("/shop")}>
          Continue Shopping
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() =>
            navigate(
              orderNumber && trackingToken ? `/track-order?order=${orderNumber}&token=${trackingToken}` : "/track-order",
              { state: customerName ? { customerName } : undefined }
            )
          }
        >
          Track Your Order
        </Button>
      </div>
    </div>
  )
}
