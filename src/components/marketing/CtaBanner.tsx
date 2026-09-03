import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"

interface CtaBannerProps {
  title: string
  subtitle?: string
  buttonLabel?: string
  to?: string
}

export default function CtaBanner({
  title,
  subtitle = "Join thousands of professionals who've upgraded the way they network.",
  buttonLabel = "Order Your Card Now",
  to = "/shop",
}: CtaBannerProps) {
  const navigate = useNavigate()
  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#EC4899] px-4 py-16 sm:py-20">
      <div className="pointer-events-none absolute -top-24 left-1/4 size-64 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-1/4 size-64 rounded-full bg-white/10 blur-3xl" />
      <div className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold text-white sm:text-3xl md:text-4xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-white/85">{subtitle}</p>
        <Button
          size="lg"
          className="mt-8 rounded-xl bg-white text-[#4F46E5] shadow-[0_10px_30px_rgba(0,0,0,0.15)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-[0_15px_35px_rgba(0,0,0,0.2)]"
          onClick={() => navigate(to)}
        >
          {buttonLabel}
        </Button>
      </div>
    </section>
  )
}
