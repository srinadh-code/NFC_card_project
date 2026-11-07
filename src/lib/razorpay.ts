import type { RazorpayCheckout } from "@/lib/api"

// Razorpay Standard Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/).
// The script is loaded only when a customer actually pays. The browser's
// success callback is NOT trusted on its own — its ids and signature are
// sent to the backend (paymentsApi.verifyPayment), which checks the
// signature with the secret key before any order exists.

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js"

interface RazorpaySuccess {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

interface RazorpayInstance {
  open: () => void
  on: (event: "payment.failed", handler: (response: { error?: { description?: string } }) => void) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

let loading: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script")
      script.src = SCRIPT_URL
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        loading = null
        reject(new Error("Couldn't load the payment window. Please check your connection and try again."))
      }
      document.body.appendChild(script)
    })
  }
  return loading
}

export class PaymentCancelled extends Error {}
export class PaymentFailed extends Error {}

/** Opens Razorpay for a backend-created checkout. Resolves with the ids and
 * signature to verify server-side; rejects with PaymentCancelled when the
 * customer closes the window, or an Error when the payment fails. */
export async function payWithRazorpay(checkout: RazorpayCheckout, brandName: string): Promise<RazorpaySuccess> {
  await loadScript()
  const Razorpay = window.Razorpay
  if (!Razorpay) throw new Error("Couldn't load the payment window. Please try again.")
  return new Promise<RazorpaySuccess>((resolve, reject) => {
    const rzp = new Razorpay({
      key: checkout.key_id,
      order_id: checkout.razorpay_order_id,
      amount: checkout.amount,
      currency: checkout.currency,
      name: brandName,
      description: "NFC card order",
      prefill: checkout.prefill,
      theme: { color: "#2855C5" },
      handler: (response: RazorpaySuccess) => resolve(response),
      modal: { ondismiss: () => reject(new PaymentCancelled("Payment cancelled.")) },
    })
    rzp.on("payment.failed", (response) => {
      reject(new PaymentFailed(response.error?.description || "The payment failed. No money was taken — please try again."))
    })
    rzp.open()
  })
}
