import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatOrderNumber } from "@/lib/mock-api"
import { useCheckoutVerificationStore } from "@/store/checkout-verification-store"

const ORDER_SUCCESS_STORAGE_KEY = "vrs-order-success"

interface OrderSuccessState {
  orderId?: string
  orderNumber?: string | null
  trackingToken?: string
  customerName?: string
  accountCreated?: boolean
  email?: string
  testPayment?: boolean
}

function readStoredSuccess(): OrderSuccessState | null {
  try {
    const raw = sessionStorage.getItem(ORDER_SUCCESS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as OrderSuccessState) : null
  } catch {
    return null
  }
}

export function storeOrderSuccess(state: OrderSuccessState) {
  sessionStorage.setItem(ORDER_SUCCESS_STORAGE_KEY, JSON.stringify(state))
}

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
  const state = ((location.state as OrderSuccessState | null) ?? readStoredSuccess())
  const rawOrderId = state?.orderId ?? null
  const trackingToken = state?.trackingToken ?? null
  const customerName = state?.customerName ?? null
  // The id-based form ("ORD000016") is what the tokenized Track Order link
  // looks up; the customer is shown the real public order number
  // ("NXTRK916378") — the one in My Orders, emails and the admin panel.
  const trackingId = rawOrderId ? formatOrderNumber(rawOrderId) : null
  const orderNumber = state?.orderNumber || trackingId

  // A guest checkout's OTP-verified contact is used up once its order exists.
  // Cleared here (not on the checkout page — see GuestCheckout.finishOrder)
  // so the next order verifies again. This page only reads router state, so
  // refreshing it never creates another order or payment.
  useEffect(() => {
    if (state?.orderId) useCheckoutVerificationStore.getState().clear()
  }, [state?.orderId])

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <CheckCircle2 className="size-20 text-success" />
      <h1 className="mt-6 text-3xl font-bold text-foreground">Order Placed Successfully</h1>
      {orderNumber && <p className="mt-4 font-mono text-lg font-bold text-primary">Order ID: {orderNumber}</p>}
      {state?.testPayment && (
        <p className="mt-2 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-foreground">
          Payment: Paid (Test) — no money was charged
        </p>
      )}
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        Your order has been placed successfully! Our team will confirm your order within 24 hours. You will receive a confirmation
        email with instructions to activate your customer account. Please check your registered email and follow the instructions
        to set your password and log in to your dashboard.
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
              trackingId && trackingToken ? `/track-order?order=${trackingId}&token=${trackingToken}` : "/track-order",
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
