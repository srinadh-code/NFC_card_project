import { useLocation, useNavigate } from "react-router-dom"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function OrderSuccess() {
  const navigate = useNavigate()
  const location = useLocation()
  const orderId = (location.state as { orderId?: string } | null)?.orderId ?? "ORD000"

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <CheckCircle2 className="size-20 text-success" />
      <h1 className="mt-6 text-3xl font-bold text-foreground">Thank You!</h1>
      <p className="mt-2 text-muted-foreground">Your order has been placed successfully.</p>
      <p className="mt-4 font-mono text-lg font-bold text-primary">Order ID: {orderId}</p>
      <p className="mt-6 text-sm text-muted-foreground">
        A confirmation email with your order details has been sent to your inbox. Your card will
        be delivered within 5-7 business days.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <Button size="lg" onClick={() => navigate("/shop")}>
          Continue Shopping
        </Button>
        <Button size="lg" variant="outline" onClick={() => navigate("/track-order")}>
          Track Your Order
        </Button>
      </div>
    </div>
  )
}
